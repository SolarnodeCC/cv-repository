import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
import allowlist from "../../shared/r2-allowlist.json";

/** Only these R2 object keys may be read/written by the editor container. */
const ALLOWED_R2_KEYS = new Set<string>(allowlist.keys);

const GITHUB_REPO_DEFAULT = "SolarnodeCC/cv-repository";

/**
 * Singleton CV editor container (RenderCV + FastAPI UI).
 * Intended for private use. Cloudflare Access on this Worker is required.
 *
 * R2 access uses virtual host `cv.r2`; GitHub API uses `github.api`
 * (Authorization injected from Worker secret — token never enters the container).
 */
export class CvEditorContainer extends Container {
  defaultPort = 8080;
  // Longer idle keeps a working session warm (fewer cold starts).
  sleepAfter = "45m";
  // Deny-by-default egress; allow R2 bridge + GitHub proxy + editor CDN assets only.
  enableInternet = false;
  allowedHosts = [
    "cv.r2",
    "github.api",
    "ai.api",
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];
  envVars = {
    R2_SYNC: "1",
    R2_HTTP_BASE: "http://cv.r2",
    GITHUB_API_BASE: "http://github.api",
    GITHUB_REPO: GITHUB_REPO_DEFAULT,
    GITHUB_BASE_BRANCH: "main",
    AI_BASE_URL: "http://ai.api/v1",
  };

  static outboundByHost = {
    "cv.r2": async (request: Request, env: Env) => {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!ALLOWED_R2_KEYS.has(key)) {
        return new Response("Forbidden key", { status: 403 });
      }

      if (request.method === "GET") {
        const object = await env.CV_DATA.get(key);
        if (!object) {
          return new Response("Not found", { status: 404 });
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        return new Response(object.body, { headers });
      }

      if (request.method === "PUT") {
        const ifMatch = request.headers.get("if-match");
        if (ifMatch) {
          const current = await env.CV_DATA.head(key);
          if (current && current.httpEtag && current.httpEtag !== ifMatch) {
            return new Response("Precondition Failed", { status: 412 });
          }
        }
        const contentType =
          request.headers.get("content-type") ?? "application/octet-stream";
        const putResult = await env.CV_DATA.put(key, request.body, {
          httpMetadata: { contentType },
        });
        const headers = new Headers({ "content-type": "application/json" });
        if (putResult?.httpEtag) {
          headers.set("etag", putResult.httpEtag);
        }
        return new Response(JSON.stringify({ ok: true, key }), {
          status: 200,
          headers,
        });
      }

      return new Response("Method not allowed", { status: 405 });
    },

    "github.api": async (request: Request, env: Env) => {
      const token = env.GITHUB_TOKEN;
      if (!token) {
        return Response.json(
          { message: "GITHUB_TOKEN secret not configured on Worker" },
          { status: 503 },
        );
      }
      const repo = env.GITHUB_REPO || GITHUB_REPO_DEFAULT;
      const url = new URL(request.url);
      const allowed = `/repos/${repo}`;
      if (url.pathname !== allowed && !url.pathname.startsWith(`${allowed}/`)) {
        return new Response("Forbidden GitHub path", { status: 403 });
      }
      const target = `https://api.github.com${url.pathname}${url.search}`;
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Accept", "application/vnd.github+json");
      headers.set("X-GitHub-Api-Version", "2022-11-28");
      headers.set("User-Agent", "solarnode-cv-editor");
      headers.delete("host");
      return fetch(target, {
        method: request.method,
        headers,
        body: request.body,
      });
    },

    "ai.api": async (request: Request, env: Env) => {
      const token = env.AI_API_KEY;
      if (!token) {
        return Response.json(
          { message: "AI_API_KEY secret not configured on Worker" },
          { status: 503 },
        );
      }
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/v1/")) {
        return new Response("Forbidden AI path", { status: 403 });
      }
      const upstream = (env.AI_UPSTREAM_BASE || "https://api.openai.com").replace(
        /\/$/,
        "",
      );
      const target = `${upstream}${url.pathname}${url.search}`;
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("User-Agent", "solarnode-cv-editor");
      headers.delete("host");
      return fetch(target, {
        method: request.method,
        headers,
        body: request.body,
      });
    },
  };
}

// Required for Containers outbound interception (R2 bridge).
export { ContainerProxy };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/edge-health") {
      return Response.json({
        ok: true,
        worker: "solarnode-cv-editor",
        r2: "solarnode-cv-data",
        allowed_r2_keys: [...ALLOWED_R2_KEYS],
        git_sync: Boolean(env.GITHUB_TOKEN),
        ai: Boolean(env.AI_API_KEY),
        sleep_after: "45m",
      });
    }

    // Warm path: light probe that still wakes the container for /api/health.
    if (url.pathname === "/api/wake") {
      const container = getContainer(env.CV_EDITOR, "default");
      const started = Date.now();
      const res = await container.fetch(
        new Request(new URL("/api/health", request.url), { method: "GET" }),
      );
      const ms = Date.now() - started;
      const body = await res.json().catch(() => ({}));
      return Response.json({
        ok: res.ok,
        wake_ms: ms,
        coldish: ms > 2500,
        health: body,
      });
    }

    const container = getContainer(env.CV_EDITOR, "default");
    return container.fetch(request);
  },
};
