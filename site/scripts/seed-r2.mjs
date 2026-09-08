#!/usr/bin/env node
/**
 * Seed solarnode-cv-data R2 with cv.yaml + rendered output artifacts.
 * Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (wrangler --remote).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const bucket = "solarnode-cv-data";

const uploads = [
  ["cv.yaml", join(repoRoot, "cv.yaml"), "text/yaml"],
  ["output/CV.pdf", join(repoRoot, "output/CV.pdf"), "application/pdf"],
  ["output/CV.html", join(repoRoot, "output/CV.html"), "text/html"],
  ["output/CV.md", join(repoRoot, "output/CV.md"), "text/markdown"],
  ["output/CV.png", join(repoRoot, "output/CV_1.png"), "image/png"],
  ["output/CV_1.png", join(repoRoot, "output/CV_1.png"), "image/png"],
];

function put(key, file, contentType) {
  if (!existsSync(file)) {
    console.warn(`skip missing ${file}`);
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
  console.log(`→ r2://${bucket}/${key}`);
  const result = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const [key, file, contentType] of uploads) {
  put(key, file, contentType);
}
console.log("R2 seed complete.");
