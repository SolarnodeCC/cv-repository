#!/usr/bin/env node
/**
 * Copy RenderCV artifacts from ../output into ./public for Workers Static Assets.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const outputDir = join(repoRoot, "output");
const publicDir = join(root, "public");

mkdirSync(publicDir, { recursive: true });

const copies = [
  ["CV.pdf", "CV.pdf"],
  ["CV.html", "CV.html"],
  ["CV.md", "CV.md"],
  ["CV_1.png", "CV.png"],
];

for (const [from, to] of copies) {
  const src = join(outputDir, from);
  if (!existsSync(src)) {
    console.error(`Missing ${src} — run \`make render\` from the repo root first.`);
    process.exit(1);
  }
  copyFileSync(src, join(publicDir, to));
  console.log(`synced ${from} → public/${to}`);
}
