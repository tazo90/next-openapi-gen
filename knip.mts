import type { KnipConfig, WorkspaceProjectConfig } from "knip";

const nextApp: WorkspaceProjectConfig = {
  project: ["**/*.{ts,tsx,js,jsx,mjs,mts,cjs,cts}"],
  next: true,
  typescript: true,
};

const nextAppWithPostcss: WorkspaceProjectConfig = {
  ...nextApp,
  postcss: true,
};

const viteApp: WorkspaceProjectConfig = {
  project: ["**/*.{ts,tsx,js,jsx,mjs,mts,cjs,cts}"],
  typescript: true,
  vite: true,
};

const config = {
  ignoreDependencies: [
    "@commitlint/config-conventional",
    "@workspace/oxfmt-config",
    "@workspace/oxlint-config",
    "@workspace/typescript-config",
    "eslint-plugin-turbo",
  ],
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
    "apps/**/src/app/api/generated/**",
    "apps/**/src/schemas/generated/**",
    "apps/**/src/types/generated/**",
    "apps/**/src/generated/api/**",
  ],
  ignoreUnresolved: ["./routeTree.gen"],
  workspaces: {
    ".": {
      entry: ["*.{json,ts,mts,cts}", ".github/workflows/*.{yml,yaml}"],
      project: ["*.{json,ts,mts,cts}", ".github/workflows/*.{yml,yaml}"],
      commitlint: true,
      "github-actions": true,
      "lint-staged": true,
      oxfmt: true,
      oxlint: true,
      playwright: true,
      pnpm: true,
      "simple-git-hooks": true,
      typescript: true,
      vitest: true,
    },
    "apps/next-app-adapter": {
      ...nextApp,
      entry: ["openapi-gen.config.ts", "next-openapi.adapter.mjs", "src/schemas/**/*.{ts,tsx}"],
      ignoreDependencies: ["ajv", "autoprefixer", "postcss"],
    },
    "apps/next-app-drizzle-zod": {
      ...nextAppWithPostcss,
      entry: ["openapi-gen.config.json", "src/db/**/*.{ts,tsx}", "src/schemas/**/*.{ts,tsx}"],
    },
    "apps/next-app-mixed-schemas": {
      ...nextApp,
      entry: ["openapi-gen.config.json", "src/schemas/**/*.{ts,tsx}", "src/types/**/*.{ts,tsx}"],
    },
    "apps/next-app-next-config": {
      ...nextApp,
      entry: ["openapi-gen.config.ts", "src/schemas/**/*.{ts,tsx}"],
      ignoreDependencies: ["ajv", "autoprefixer", "postcss"],
    },
    "apps/next-app-sandbox": {
      ...nextAppWithPostcss,
      entry: ["next.openapi.json"],
      ignoreDependencies: ["ajv"],
    },
    "apps/next-app-scalar": {
      ...nextAppWithPostcss,
      entry: ["openapi-gen.config.mts"],
      ignoreDependencies: ["ajv", "zod"],
    },
    "apps/next-app-swagger": {
      ...nextApp,
      entry: ["next.openapi.json"],
      ignoreDependencies: ["zod"],
    },
    "apps/next-app-ts-config": {
      ...nextApp,
      entry: [
        "openapi-gen.config.ts",
        "scripts/generate-typescript-client.mjs",
        "src/schemas/**/*.{ts,tsx}",
      ],
      ignoreDependencies: ["ajv", "autoprefixer", "postcss"],
    },
    "apps/next-app-typescript": {
      ...nextAppWithPostcss,
      entry: ["openapi-gen.config.ts", "src/types/**/*.{ts,tsx}"],
      ignoreDependencies: ["ajv"],
    },
    "apps/next-app-zod": {
      ...nextAppWithPostcss,
      entry: ["openapi-gen.config.ts", "src/schemas/**/*.{ts,tsx}"],
      ignoreDependencies: ["ajv"],
    },
    "apps/next-pages-router": {
      ...nextApp,
      entry: ["openapi-gen.config.ts", "schemas/**/*.{ts,tsx}"],
    },
    "apps/react-router-app": {
      ...viteApp,
      entry: ["openapi-gen.config.ts", "src/routes/**/*.{ts,tsx}", "src/schemas/**/*.{ts,tsx}"],
      ignoreDependencies: ["ajv"],
    },
    "apps/tanstack-app": {
      ...viteApp,
      entry: [
        "openapi-gen.config.ts",
        "src/router.tsx",
        "src/routes/**/*.{ts,tsx}",
        "src/schemas/**/*.{ts,tsx}",
      ],
      ignoreDependencies: ["ajv"],
    },
    "packages/*": {
      project: ["**/*.{ts,tsx,js,jsx,mjs,mts,cjs,cts,json}"],
      oxfmt: true,
      oxlint: true,
      typescript: true,
    },
    "packages/next-openapi-gen": {
      entry: ["src/index.ts"],
      ignoreDependencies: [
        "@babel/parser",
        "@babel/traverse",
        "@babel/types",
        "commander",
        "cross-spawn",
        "fs-extra",
        "js-yaml",
        "ora",
      ],
    },
    "packages/typescript-config": {
      ignoreUnresolved: ["next"],
    },
    tests: {
      entry: ["bench/**/*.ts", "**/*.{test,spec}.ts", "**/*.{test,spec}.tsx"],
      project: ["**/*.{ts,tsx}"],
      playwright: true,
      typescript: true,
      vitest: true,
    },
  },
} satisfies KnipConfig;

export default config;
