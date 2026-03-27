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
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "packages/next-openapi-gen/src/index.ts",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
