#!/usr/bin/env node
/**
 * Post-deploy ops for solarnode-cv-editor:
 * 1) Put GITHUB_TOKEN Worker secret (from CV_EDITOR_GITHUB_TOKEN)
 * 2) Ensure Cloudflare Access app protects the Worker (production + previews)
 * 3) Smoke-check: unauthenticated edge-health must be blocked by Access (or warn)
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN (required)
 *   CLOUDFLARE_ACCOUNT_ID (required)
 *   CV_EDITOR_GITHUB_TOKEN (optional but required for Sync Git)
 *   ACCESS_ALLOWED_EMAILS (comma-separated; default info@solarnode.cc)
 *   EDITOR_WORKER_NAME (default solarnode-cv-editor)
 *   SKIP_ACCESS_ENSURE=1 to skip Access upsert
 *   SKIP_SECRET_PUT=1 to skip secret put
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const editorDir = join(root, "..");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const workerName = process.env.EDITOR_WORKER_NAME || "solarnode-cv-editor";
const gitToken = process.env.CV_EDITOR_GITHUB_TOKEN || "";
const emails = (process.env.ACCESS_ALLOWED_EMAILS || "info@solarnode.cc")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

if (!accountId || !apiToken) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
  process.exit(1);
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = JSON.stringify(json.errors || json, null, 2);
    throw new Error(`Cloudflare API ${method} ${path} failed (${res.status}): ${err}`);
  }
  return json.result;
}

function putGithubSecret() {
  if (process.env.SKIP_SECRET_PUT === "1") {
    console.log("skip secret put (SKIP_SECRET_PUT=1)");
    return false;
  }
  if (!gitToken) {
    console.warn(
      "CV_EDITOR_GITHUB_TOKEN not set — Sync Git stays disabled until you add that GitHub Actions secret and re-run deploy.",
    );
    return false;
  }
  console.log("→ wrangler secret put GITHUB_TOKEN");
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", "GITHUB_TOKEN"],
    {
      cwd: editorDir,
      input: gitToken,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
    },
  );
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    throw new Error("wrangler secret put GITHUB_TOKEN failed");
  }
  console.log("GITHUB_TOKEN secret updated on Worker");
  return true;
}

async function resolveWorkerId() {
  // Prefer scripts list; fall back to service bindings metadata.
  const scripts = await cf(`/accounts/${accountId}/workers/scripts`);
  const match = (scripts || []).find((s) => s.id === workerName || s.id?.includes?.(workerName));
  if (match?.id) return match.id;
  // Newer API shape: list deployments / services
  try {
    const services = await cf(`/accounts/${accountId}/workers/services`);
    const svc = (services || []).find((s) => s.id === workerName || s.name === workerName);
    if (svc?.id) return svc.id;
  } catch {
    /* older accounts may lack this endpoint */
  }
  throw new Error(`Worker '${workerName}' not found in account ${accountId}`);
}

async function ensureAccess(workerId) {
  if (process.env.SKIP_ACCESS_ENSURE === "1") {
    console.log("skip Access ensure (SKIP_ACCESS_ENSURE=1)");
    return null;
  }
  const appName = `Protect ${workerName}`;
  const apps = await cf(`/accounts/${accountId}/access/apps`);
  let app = (apps || []).find(
    (a) =>
      a.name === appName ||
      (Array.isArray(a.destinations) &&
        a.destinations.some((d) => d.type === "worker" && d.worker_id === workerId)),
  );

  const destinations = [{ type: "worker", worker_id: workerId }];
  const policyInclude = emails.map((email) => ({ email: { email } }));

  if (!app) {
    console.log(`→ create Access app '${appName}' for worker ${workerId}`);
    app = await cf(`/accounts/${accountId}/access/apps`, {
      method: "POST",
      body: {
        name: appName,
        type: "self_hosted",
        destinations,
        session_duration: "24h",
        auto_redirect_to_identity: true,
        policies: [
          {
            name: "Allow Solarnode emails",
            decision: "allow",
            include: policyInclude,
          },
        ],
      },
    });
    console.log(`Access app created: ${app.id}`);
  } else {
    console.log(`→ update Access app ${app.id} destinations + allowlist`);
    await cf(`/accounts/${accountId}/access/apps/${app.id}`, {
      method: "PUT",
      body: {
        name: app.name || appName,
        type: "self_hosted",
        destinations,
        session_duration: app.session_duration || "24h",
        auto_redirect_to_identity: true,
        policies: [
          {
            name: "Allow Solarnode emails",
            decision: "allow",
            include: policyInclude,
          },
        ],
      },
    });
    console.log("Access app updated");
  }
  return app;
}

async function smokeAccess(workersDevHost) {
  const url = `https://${workersDevHost}/edge-health`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { redirect: "manual" });
    const status = res.status;
    if (status === 200) {
      const text = await res.text();
      if (text.includes('"ok":true')) {
        console.warn(
          `SMOKE attempt ${attempt}/5: ${url} still public JSON — waiting for Access propagation…`,
        );
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
    }
    console.log(`SMOKE OK: unauthenticated ${url} → HTTP ${status} (Access gate present)`);
    return true;
  }
  console.error(
    `SMOKE FAIL: ${url} still returns public JSON after Access upsert. Check Zero Trust / token permissions (Access:Edit).`,
  );
  process.exitCode = 2;
  return false;
}

async function smokeGitSync(workersDevHost) {
  // Only works without Access or with a bypass; after Access, skip unless SERVICE token set.
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    const res = await fetch(`https://${workersDevHost}/edge-health`, {
      headers: {
        "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
        "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET,
      },
    });
    const body = await res.json();
    console.log("edge-health (service token):", body);
    if (!body.git_sync) {
      throw new Error("git_sync is false on edge-health after secret put");
    }
    return true;
  }
  console.log("skip authenticated git_sync smoke (no CF_ACCESS_CLIENT_ID/SECRET)");
  return null;
}

const workersDevHost =
  process.env.EDITOR_WORKERS_DEV_HOST || `${workerName}.oostelaar.workers.dev`;

const secretOk = putGithubSecret();
const workerId = await resolveWorkerId();
console.log(`worker id: ${workerId}`);
await ensureAccess(workerId);
await smokeAccess(workersDevHost);
if (secretOk) {
  await smokeGitSync(workersDevHost);
}

console.log("post-deploy ops complete.");
