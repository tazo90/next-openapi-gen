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
        "packages/next-openapi-gen/src/cli/commands/generate.ts",
        "packages/next-openapi-gen/src/cli/commands/init.ts",
        "packages/next-openapi-gen/src/config/normalize.ts",
        "packages/next-openapi-gen/src/generator/openapi-generator.ts",
        "packages/next-openapi-gen/src/init/install-dependencies.ts",
        "packages/next-openapi-gen/src/init/ui-registry.ts",
        "packages/next-openapi-gen/src/routes/app-router-strategy.ts",
        "packages/next-openapi-gen/src/routes/operation-processor.ts",
        "packages/next-openapi-gen/src/routes/pages-router-strategy.ts",
        "packages/next-openapi-gen/src/routes/response-processor.ts",
        "packages/next-openapi-gen/src/routes/route-processor.ts",
        "packages/next-openapi-gen/src/schema/core/custom-schema-file-processor.ts",
        "packages/next-openapi-gen/src/schema/typescript/schema-processor.ts",
        "packages/next-openapi-gen/src/schema/zod/drizzle-zod-processor.ts",
        "packages/next-openapi-gen/src/schema/zod/file-processor.ts",
        "packages/next-openapi-gen/src/schema/zod/import-processor.ts",
        "packages/next-openapi-gen/src/schema/zod/zod-converter.ts",
        "packages/next-openapi-gen/src/shared/logger.ts",
        "packages/next-openapi-gen/src/shared/utils.ts",
        "**/*.d.ts",
        "**/*.config.*",
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
