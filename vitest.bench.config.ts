import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageSrcDir = path.join(rootDir, "packages", "next-openapi-gen", "src");

export default defineConfig({
  resolve: {
    alias: {
      "@next-openapi-gen": packageSrcDir,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/bench/**/*.bench.ts", "tests/bench/**/*.test.ts"],
    exclude: ["**/.pnpm-store/**"],
  },
});
