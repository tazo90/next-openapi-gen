import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreFiles: [
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "turbo/**",
    "apps/react-router-app/.react-router/**",
    "packages/next-openapi-gen/dist/**",
    "packages/next-openapi-gen/templates/**",
    "packages/openapi-init/templates/**",
    "tests/fixtures/**",
  ],
  ignoreIssues: {
    "apps/next-app-mixed-schemas/package.json": ["devDependencies"],
    "apps/next-app-sandbox/package.json": ["devDependencies"],
    "apps/next-app-scalar/package.json": ["devDependencies"],
    "apps/next-app-typescript/package.json": ["devDependencies"],
    "apps/next-app-zod/package.json": ["devDependencies"],
    "apps/next-app-adapter/package.json": ["devDependencies"],
    "apps/next-app-next-config/package.json": ["devDependencies"],
    "apps/next-app-ts-config/package.json": ["devDependencies"],
    "apps/next-pages-router/package.json": ["devDependencies"],
    "apps/react-router-app/package.json": ["devDependencies"],
    "apps/tanstack-app/package.json": ["devDependencies"],
    "packages/next-openapi-gen/package.json": ["dependencies"],
  },
  ignoreUnresolved: ["next", "./routeTree.gen"],
  workspaces: {
    ".": {
      entry: [
        "*.{json,ts,mts,cts}",
        ".github/workflows/*.{yml,yaml}",
        "tests/bench/**/*.ts",
        "tests/**/*.{test,spec}.ts",
        "tests/**/*.{test,spec}.tsx",
      ],
      project: ["*.{json,ts,mts,cts}", ".github/workflows/*.{yml,yaml}", "tests/**/*.{ts,tsx}"],
      commitlint: true,
      "github-actions": true,
      "lint-staged": true,
      playwright: true,
      pnpm: true,
      "simple-git-hooks": true,
      typescript: true,
      vitest: true,
    },
    "apps/*": {
      entry: [
        "openapi-gen.config.ts",
        "next.openapi.json",
        "next-openapi.adapter.mjs",
        "next-openapi.config.ts",
        "schemas/**/*.{ts,tsx}",
        "src/db/**/*.{ts,tsx}",
        "src/router.tsx",
        "src/routes/**/*.{ts,tsx}",
        "src/schemas/**/*.{ts,tsx}",
        "src/types/**/*.{ts,tsx}",
      ],
      project: ["**/*.{ts,tsx,js,jsx,mjs,mts,cjs,cts}"],
      next: true,
      postcss: true,
      typescript: true,
    },
    "packages/*": {
      project: ["**/*.{ts,tsx,js,jsx,mjs,mts,cjs,cts,json}"],
      oxfmt: true,
      oxlint: true,
      typescript: true,
    },
    "packages/next-openapi-gen": {
      entry: ["src/index.ts"],
    },
  },
};

export default config;
