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

const defaultTestInclude = ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"];
const coverageScopes = {
  "next-openapi-gen": {
    include: ["packages/next-openapi-gen/src/**/*.ts"],
    testInclude: [
      "tests/unit/public/**/*.test.ts",
      "tests/unit/next/**/*.test.ts",
      "tests/unit/react-router/**/*.test.ts",
      "tests/unit/vite/**/*.test.ts",
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-cli": {
    include: ["packages/openapi-cli/src/**/*.ts"],
    testInclude: ["tests/unit/cli/**/*.test.ts", "tests/unit/frameworks/index.test.ts"],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-core": {
    include: ["packages/openapi-core/src/**/*.ts"],
    testInclude: defaultTestInclude,
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-framework-next": {
    include: ["packages/openapi-framework-next/src/**/*.ts"],
    testInclude: [
      "tests/unit/frameworks/next/**/*.test.ts",
      "tests/unit/next/**/*.test.ts",
      "tests/unit/routes/app-router-strategy.test.ts",
      "tests/unit/routes/pages-router-strategy.test.ts",
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-framework-react-router": {
    include: ["packages/openapi-framework-react-router/src/**/*.ts"],
    testInclude: [
      "tests/unit/frameworks/react-router/**/*.test.ts",
      "tests/unit/react-router/**/*.test.ts",
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-framework-tanstack": {
    include: ["packages/openapi-framework-tanstack/src/**/*.ts"],
    testInclude: ["tests/unit/frameworks/tanstack/**/*.test.ts", "tests/unit/vite/**/*.test.ts"],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  "openapi-init": {
    include: ["packages/openapi-init/src/**/*.ts"],
    testInclude: ["tests/unit/init/**/*.test.ts"],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
} as const;
const coverageScope = process.env.COVERAGE_SCOPE as keyof typeof coverageScopes | undefined;
const selectedCoverageScope = coverageScope ? coverageScopes[coverageScope] : undefined;

if (coverageScope && !selectedCoverageScope) {
  throw new Error(`Unknown COVERAGE_SCOPE "${coverageScope}"`);
}

export default defineConfig({
  resolve: {
    alias: packageSrcDirs,
  },
  test: {
    globals: true,
    environment: "node",
    include: selectedCoverageScope?.testInclude ?? defaultTestInclude,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: selectedCoverageScope?.include ?? [
        "packages/openapi-cli/src/**/*.ts",
        "packages/openapi-core/src/**/*.ts",
        "packages/openapi-framework-next/src/**/*.ts",
        "packages/openapi-framework-react-router/src/**/*.ts",
        "packages/openapi-framework-tanstack/src/**/*.ts",
        "packages/openapi-init/src/**/*.ts",
        "packages/next-openapi-gen/src/**/*.ts",
      ],
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "packages/openapi-init/templates/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types.ts",
        // Pure re-export barrels: coverage is tracked on the concrete modules they load.
        "packages/openapi-core/src/index.ts",
        // Type-only adapter contracts (no runtime executable statements).
        "packages/openapi-core/src/core/adapters.ts",
        "packages/openapi-framework-next/src/index.ts",
        "packages/openapi-framework-tanstack/src/index.ts",
        "packages/openapi-framework-react-router/src/index.ts",
        "packages/openapi-init/src/index.ts",
      ],
      thresholds: selectedCoverageScope?.thresholds ?? {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
