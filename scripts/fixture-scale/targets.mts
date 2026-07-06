import path from "node:path";
import { fileURLToPath } from "node:url";

import type { FrameworkKind } from "./routes.mts";
import type { SchemaFlavor } from "./schemas.mts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "../..");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "projects");

export type TemplateOptions = {
  title: string;
  description: string;
  framework?: FrameworkKind;
  schemaType: SchemaFlavor | SchemaFlavor[] | "typescript";
  apiDir: string;
  schemaDir: string;
  includeOpenApiRoutes?: boolean;
  ignoreRoutes?: string[];
  templateSource?: string;
};

export type SchemaLayout = "src-types" | "src-schemas" | "schemas-root";

export type ScaleTarget = {
  id: string;
  outputPath: string;
  framework: FrameworkKind;
  flavor: SchemaFlavor | "typescript" | "filtered" | "mixed";
  operationIdPrefix: string;
  schemaLayout: SchemaLayout;
  template: TemplateOptions;
  copySchemasFrom?: string;
  copyShowcaseRoutesFrom?: string;
  cleanGeneratedSubdirs: string[];
};

export const FIXTURE_TARGETS: ScaleTarget[] = [
  target({
    id: "next-app-core-at-scale",
    outputPath: "next/app-router/core-flow-at-scale",
    framework: "next-app-router",
    flavor: "typescript",
    operationIdPrefix: "scale",
    templateSource: "next/app-router/core-flow",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: "typescript",
    title: "App Router Core Flow At Scale",
    description: "Large-scale TypeScript fixture for realistic generator benchmarks",
  }),
  target({
    id: "next-app-ts-full-at-scale",
    outputPath: "next/app-router/ts-full-coverage-at-scale",
    framework: "next-app-router",
    flavor: "typescript",
    operationIdPrefix: "tsFullScale",
    templateSource: "next/app-router/ts-full-coverage",
    copySchemasFrom: "next/app-router/ts-full-coverage/src/schemas",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: "typescript",
    title: "App Router TypeScript Full Coverage At Scale",
    description: "Large-scale TypeScript fixture with feature catalog schemas",
  }),
  target({
    id: "next-app-zod-full-at-scale",
    outputPath: "next/app-router/zod-full-coverage-at-scale",
    framework: "next-app-router",
    flavor: "zod",
    operationIdPrefix: "zodFullScale",
    templateSource: "next/app-router/zod-full-coverage",
    copySchemasFrom: "next/app-router/zod-full-coverage/src/schemas",
    schemaLayout: "src-schemas",
    schemaDir: "./src/schemas",
    schemaType: "zod",
    title: "App Router Zod Full Coverage At Scale",
    description: "Large-scale Zod fixture with feature catalog schemas",
  }),
  target({
    id: "next-app-zod-only-at-scale",
    outputPath: "next/app-router/zod-only-coverage-at-scale",
    framework: "next-app-router",
    flavor: "zod",
    operationIdPrefix: "zodOnlyScale",
    templateSource: "next/app-router/zod-only-coverage",
    copySchemasFrom: "next/app-router/zod-only-coverage/src/schemas",
    schemaLayout: "src-schemas",
    schemaDir: "./src/schemas",
    schemaType: "zod",
    title: "App Router Zod Coverage At Scale",
    description: "Large-scale Zod-only fixture",
  }),
  target({
    id: "next-app-mixed-at-scale",
    outputPath: "next/app-router/mixed-schemas-at-scale",
    framework: "next-app-router",
    flavor: "mixed",
    operationIdPrefix: "mixedScale",
    templateSource: "next/app-router/mixed-schemas",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: ["typescript", "zod"],
    title: "App Router Mixed Schemas At Scale",
    description: "Large-scale mixed TypeScript and Zod fixture",
  }),
  target({
    id: "next-app-drizzle-at-scale",
    outputPath: "next/app-router/drizzle-zod-flow-at-scale",
    framework: "next-app-router",
    flavor: "drizzle-zod",
    operationIdPrefix: "drizzleScale",
    templateSource: "next/app-router/drizzle-zod-flow",
    copySchemasFrom: "next/app-router/drizzle-zod-flow/src/schemas",
    schemaLayout: "src-schemas",
    schemaDir: "./src/schemas",
    schemaType: "zod",
    title: "App Router Drizzle Zod Flow At Scale",
    description: "Large-scale Drizzle Zod fixture",
  }),
  target({
    id: "next-app-ignore-at-scale",
    outputPath: "next/app-router/ignore-routes-at-scale",
    framework: "next-app-router",
    flavor: "filtered",
    operationIdPrefix: "ignoreScale",
    templateSource: "next/app-router/ignore-routes",
    copyShowcaseRoutesFrom: "next/app-router/ignore-routes/src/app/api",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: "typescript",
    title: "Ignore Routes At Scale",
    description: "Large-scale fixture with ignore route filtering",
    includeOpenApiRoutes: false,
    ignoreRoutes: ["/admin/*", "/debug", "/public/info"],
  }),
  target({
    id: "next-pages-core-at-scale",
    outputPath: "next/pages-router/core-flow-at-scale",
    framework: "next-pages-router",
    flavor: "typescript",
    operationIdPrefix: "pagesScale",
    templateSource: "next/pages-router/core-flow",
    schemaLayout: "schemas-root",
    schemaDir: "./schemas",
    schemaType: "typescript",
    title: "Pages Router Core Flow At Scale",
    description: "Large-scale pages router TypeScript fixture",
    apiDir: "./pages/api",
  }),
  target({
    id: "next-pages-zod-at-scale",
    outputPath: "next/pages-router/zod-flow-at-scale",
    framework: "next-pages-router",
    flavor: "zod",
    operationIdPrefix: "pagesZodScale",
    templateSource: "next/pages-router/zod-flow",
    schemaLayout: "schemas-root",
    schemaDir: "./schemas",
    schemaType: "zod",
    title: "Pages Router Zod Flow At Scale",
    description: "Large-scale pages router Zod fixture",
    apiDir: "./pages/api",
  }),
  target({
    id: "tanstack-core-at-scale",
    outputPath: "tanstack/core-flow-at-scale",
    framework: "tanstack",
    flavor: "typescript",
    operationIdPrefix: "tanstackScale",
    templateSource: "tanstack/core-flow",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: "typescript",
    title: "TanStack Core Flow At Scale",
    description: "Large-scale TanStack fixture",
    apiDir: "./src/routes/api",
  }),
  target({
    id: "react-router-core-at-scale",
    outputPath: "react-router/core-flow-at-scale",
    framework: "react-router",
    flavor: "typescript",
    operationIdPrefix: "reactRouterScale",
    templateSource: "react-router/core-flow",
    schemaLayout: "src-types",
    schemaDir: "./src",
    schemaType: "typescript",
    title: "React Router Core Flow At Scale",
    description: "Large-scale React Router fixture",
    apiDir: "./src/routes/api",
  }),
];

export type AppTarget = ScaleTarget & {
  appDir: string;
};

export const APP_TARGETS: AppTarget[] = [
  appTarget(
    "next-app-typescript",
    "next-app-router",
    "typescript",
    "scaleApp",
    "src-types",
    "./src/types",
    "typescript",
  ),
  appTarget(
    "next-app-zod",
    "next-app-router",
    "zod",
    "zodAppScale",
    "src-schemas",
    "./src/schemas",
    "zod",
  ),
  appTarget(
    "next-app-mixed-schemas",
    "next-app-router",
    "mixed",
    "mixedAppScale",
    "src-types",
    "./src",
    ["typescript", "zod"],
  ),
  appTarget(
    "next-app-drizzle-zod",
    "next-app-router",
    "drizzle-zod",
    "drizzleAppScale",
    "src-schemas",
    "./src/schemas",
    "zod",
  ),
  appTarget(
    "next-pages-router",
    "next-pages-router",
    "typescript",
    "pagesAppScale",
    "schemas-root",
    "./schemas",
    "typescript",
  ),
  appTarget(
    "tanstack-app",
    "tanstack",
    "typescript",
    "tanstackAppScale",
    "src-types",
    "./src",
    "typescript",
  ),
  appTarget(
    "react-router-app",
    "react-router",
    "typescript",
    "reactRouterAppScale",
    "src-types",
    "./src",
    "typescript",
  ),
  appTarget(
    "next-app-swagger",
    "next-app-router",
    "zod",
    "swaggerAppScale",
    "src-schemas",
    "./src/schemas",
    "zod",
  ),
  appTarget(
    "next-app-next-config",
    "next-app-router",
    "typescript",
    "nextConfigAppScale",
    "src-schemas",
    "./src/schemas",
    "typescript",
  ),
  appTarget(
    "next-app-ts-config",
    "next-app-router",
    "typescript",
    "tsConfigAppScale",
    "src-schemas",
    "./src/schemas",
    "typescript",
  ),
  appTarget(
    "next-app-adapter",
    "next-app-router",
    "typescript",
    "adapterAppScale",
    "src-schemas",
    "./src/schemas",
    "typescript",
  ),
  appTarget(
    "next-app-scalar",
    "next-app-router",
    "zod",
    "scalarAppScale",
    "src-schemas",
    "./src/schemas",
    "zod",
  ),
  appTarget(
    "next-app-sandbox",
    "next-app-router",
    "typescript",
    "sandboxAppScale",
    "src-schemas",
    "./src/schemas",
    "typescript",
  ),
];

function target(config: {
  id: string;
  outputPath: string;
  framework: FrameworkKind;
  flavor: SchemaFlavor | "typescript" | "filtered" | "mixed";
  operationIdPrefix: string;
  templateSource?: string;
  copySchemasFrom?: string;
  copyShowcaseRoutesFrom?: string;
  schemaLayout: SchemaLayout;
  schemaDir: string;
  schemaType: SchemaFlavor | SchemaFlavor[] | "typescript";
  title: string;
  description: string;
  apiDir?: string;
  includeOpenApiRoutes?: boolean;
  ignoreRoutes?: string[];
}): ScaleTarget {
  return {
    id: config.id,
    outputPath: path.join(fixtureRoot, config.outputPath),
    framework: config.framework,
    flavor: config.flavor,
    operationIdPrefix: config.operationIdPrefix,
    schemaLayout: config.schemaLayout,
    copySchemasFrom: config.copySchemasFrom
      ? path.join(fixtureRoot, config.copySchemasFrom)
      : undefined,
    copyShowcaseRoutesFrom: config.copyShowcaseRoutesFrom
      ? path.join(fixtureRoot, config.copyShowcaseRoutesFrom)
      : undefined,
    cleanGeneratedSubdirs: getCleanDirs(config.framework, config.schemaLayout),
    template: {
      title: config.title,
      description: config.description,
      framework: config.framework,
      schemaType: config.schemaType,
      apiDir: config.apiDir ?? defaultApiDir(config.framework),
      schemaDir: config.schemaDir,
      includeOpenApiRoutes: config.includeOpenApiRoutes,
      ignoreRoutes: config.ignoreRoutes,
      templateSource: config.templateSource
        ? path.join(fixtureRoot, config.templateSource)
        : undefined,
    },
  };
}

function appTarget(
  appName: string,
  framework: FrameworkKind,
  flavor: SchemaFlavor | "mixed",
  operationIdPrefix: string,
  schemaLayout: SchemaLayout,
  schemaDir: string,
  schemaType: SchemaFlavor | SchemaFlavor[] | "typescript",
): AppTarget {
  const appDir = path.join(repoRoot, "apps", appName);
  return {
    id: appName,
    appDir,
    outputPath: appDir,
    framework,
    flavor,
    operationIdPrefix,
    schemaLayout,
    cleanGeneratedSubdirs: getCleanDirs(framework, schemaLayout),
    template: {
      title: `${appName} generated scale routes`,
      description: `Generated scale routes for ${appName}`,
      framework,
      schemaType,
      apiDir: defaultApiDir(framework),
      schemaDir,
    },
  };
}

function defaultApiDir(framework: FrameworkKind): string {
  switch (framework) {
    case "next-app-router":
      return "./src/app/api";
    case "next-pages-router":
      return "./pages/api";
    case "tanstack":
    case "react-router":
      return "./src/routes/api";
    default: {
      const neverFramework: never = framework;
      return neverFramework;
    }
  }
}

function getCleanDirs(framework: FrameworkKind, schemaLayout: SchemaLayout): string[] {
  const schemaDirs =
    schemaLayout === "schemas-root"
      ? ["schemas/generated"]
      : schemaLayout === "src-schemas"
        ? ["src/schemas/generated", "src/db/schema.generated.ts"]
        : ["src/types/generated", "src/schemas/generated"];

  switch (framework) {
    case "next-app-router":
      return ["src/app/api/generated", ...schemaDirs];
    case "next-pages-router":
      return ["pages/api/generated", ...schemaDirs.filter((dir) => dir.startsWith("schemas"))];
    case "tanstack":
    case "react-router":
      return ["src/routes/api/generated", ...schemaDirs];
    default: {
      const neverFramework: never = framework;
      return neverFramework;
    }
  }
}
