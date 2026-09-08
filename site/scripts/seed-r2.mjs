#!/usr/bin/env node
/**
 * Seed solarnode-cv-data R2 with cv.yaml + rendered output artifacts.
 * Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (wrangler --remote).
 *
 * Default: non-destructive — skip keys that already exist (editor is live writer).
 * Force overwrite: --force  or  R2_SEED_FORCE=1  (bootstrap / promote from Git).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const bucket = "solarnode-cv-data";
const force =
  process.argv.includes("--force") ||
  process.env.R2_SEED_FORCE === "1" ||
  process.env.R2_SEED_FORCE === "true";

const allowlist = JSON.parse(
  readFileSync(join(repoRoot, "shared", "r2-allowlist.json"), "utf8"),
);
const allowedKeys = new Set(allowlist.keys);

const uploads = [
  ["cv.yaml", join(repoRoot, "cv.yaml"), "text/yaml"],
  ["output/CV.pdf", join(repoRoot, "output/CV.pdf"), "application/pdf"],
  ["output/CV.html", join(repoRoot, "output/CV.html"), "text/html"],
  ["output/CV.md", join(repoRoot, "output/CV.md"), "text/markdown"],
  ["output/CV.png", join(repoRoot, "output/CV_1.png"), "image/png"],
  ["output/CV_1.png", join(repoRoot, "output/CV_1.png"), "image/png"],
];

for (const [key] of uploads) {
  if (!allowedKeys.has(key)) {
    console.error(`Refusing unknown R2 key (not in shared/r2-allowlist.json): ${key}`);
    process.exit(1);
  }
}

function objectExists(key) {
  const dir = mkdtempSync(join(tmpdir(), "r2-seed-"));
  const dest = join(dir, "object");
  try {
    const args = [
      "wrangler",
      "r2",
      "object",
      "get",
      `${bucket}/${key}`,
      "--file",
      dest,
      "--remote",
    ];
    const result = spawnSync("npx", args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      encoding: "utf8",
    });
    return result.status === 0 && existsSync(dest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function put(key, file, contentType) {
  if (!existsSync(file)) {
    console.warn(`skip missing ${file}`);
    return;
  }
  if (!force && objectExists(key)) {
    console.log(`↷ skip existing r2://${bucket}/${key} (use --force to overwrite)`);
    return;
  }
  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    file,
    "--content-type",
    contentType,
    "--remote",
  ];
  console.log(`${force ? "→ (force) " : "→ "}r2://${bucket}/${key}`);
  const result = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  force
    ? "R2 seed mode: FORCE (overwrite existing keys)"
    : "R2 seed mode: bootstrap-only (skip existing keys)",
);

for (const [key, file, contentType] of uploads) {
  put(key, file, contentType);
}
console.log("R2 seed complete.");
