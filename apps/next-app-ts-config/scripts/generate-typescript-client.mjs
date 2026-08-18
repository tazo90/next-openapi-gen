import { spawnSync } from "node:child_process";

const [specPath, outputDir] = process.argv.slice(2);

if (!specPath || !outputDir) {
  console.error("Usage: generate-typescript-client.mjs <spec-path> <output-dir>");
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "openapi-generator-cli",
    "generate",
    "-g",
    "typescript-fetch",
    "-i",
    specPath,
    "-o",
    outputDir,
  ],
  { stdio: "inherit", shell: false },
);

process.exit(result.status ?? 1);
