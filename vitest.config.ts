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
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/next-openapi-gen/src/**/*.ts"],
      exclude: ["node_modules/", "dist/", "tests/", "**/*.d.ts", "**/*.config.*"],
      thresholds: {
        statements: 62,
        branches: 51,
        functions: 71,
        lines: 62,
      },
    },
  },
});
