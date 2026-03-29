import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageSrcDirs = {
  "@workspace/openapi-cli": path.join(rootDir, "packages", "openapi-cli", "src"),
  "@workspace/openapi-core": path.join(rootDir, "packages", "openapi-core", "src"),
  "@workspace/openapi-framework-next": path.join(
    rootDir,
    "packages",
    "openapi-framework-next",
    "src",
  ),
  "@workspace/openapi-framework-react-router": path.join(
    rootDir,
    "packages",
    "openapi-framework-react-router",
    "src",
  ),
  "@workspace/openapi-framework-tanstack": path.join(
    rootDir,
    "packages",
    "openapi-framework-tanstack",
    "src",
  ),
  "@workspace/openapi-init": path.join(rootDir, "packages", "openapi-init", "src"),
  "@next-openapi-gen": path.join(rootDir, "packages", "next-openapi-gen", "src"),
  "next-openapi-gen": path.join(rootDir, "packages", "next-openapi-gen", "src"),
} as const;

export default defineConfig({
  resolve: {
    alias: packageSrcDirs,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/bench/**/*.bench.ts", "tests/bench/**/*.test.ts"],
    exclude: ["**/.pnpm-store/**"],
  },
});
