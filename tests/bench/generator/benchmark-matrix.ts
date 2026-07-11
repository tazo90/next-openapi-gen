import {
  OpenApiGenerator,
  type GeneratorPerformanceProfile,
  type OpenApiDocument,
  type OpenApiTemplate,
} from "next-openapi-gen";

import { createSharedGenerationRuntime } from "@workspace/openapi-core/core/runtime.js";
import {
  FrameworkKind,
  type OpenApiVersion,
  type RouterType,
} from "@workspace/openapi-core/shared/types.js";

import {
  copyProjectFixture,
  getProjectFixturePath,
  materializeTemplateVariant,
  withProjectCwd,
  type TempProject,
} from "../../helpers/test-project.js";

export type BenchmarkOpenApiVersion = Extract<OpenApiVersion, "3.0" | "3.1" | "3.2">;
export type BenchmarkSchemaFlavor = "typescript" | "zod" | "drizzle-zod" | "mixed" | "filtered";
export type BenchmarkPackageEntry = "." | "./next" | "./vite" | "./react-router";
export type BenchmarkRouterKind = RouterType | "generic";
export type BenchmarkMode = "cold" | "warm" | "profile" | "scale";

export type BenchmarkScenario = {
  id: string;
  fixturePath: string;
  fixtureName: string;
  packageEntry: BenchmarkPackageEntry;
  frameworkKind: FrameworkKind;
  router: BenchmarkRouterKind;
  schemaFlavor: BenchmarkSchemaFlavor;
  openapiVersion: BenchmarkOpenApiVersion;
  modes: readonly BenchmarkMode[];
  templateOverrides?: Partial<OpenApiTemplate>;
};

export type BenchProject = {
  scenario: BenchmarkScenario;
  project: TempProject;
  templatePath: string;
};

type VersionedScenarioDefinition = Omit<BenchmarkScenario, "id" | "modes" | "openapiVersion"> & {
  idPrefix: string;
};

const BENCHMARK_VERSIONS = ["3.0", "3.1", "3.2"] as const;
const BENCHMARK_MODES = ["cold", "warm", "profile"] as const;

const nextAppRouterCoreFlow = getProjectFixturePath("next", "app-router", "core-flow");
const nextAppRouterIgnoreRoutes = getProjectFixturePath("next", "app-router", "ignore-routes");
const nextAppRouterMixedSchemas = getProjectFixturePath("next", "app-router", "mixed-schemas");
const nextAppRouterDrizzleZod = getProjectFixturePath("next", "app-router", "drizzle-zod-flow");
const nextAppRouterZodOnlyCoverage = getProjectFixturePath(
  "next",
  "app-router",
  "zod-only-coverage",
);
const nextAppRouterZodFullCoverage = getProjectFixturePath(
  "next",
  "app-router",
  "zod-full-coverage",
);
const nextAppRouterTypescriptFullCoverage = getProjectFixturePath(
  "next",
  "app-router",
  "ts-full-coverage",
);
const nextPagesRouterCoreFlow = getProjectFixturePath("next", "pages-router", "core-flow");
const nextPagesRouterZodFlow = getProjectFixturePath("next", "pages-router", "zod-flow");
const tanstackCoreFlow = getProjectFixturePath("tanstack", "core-flow");
const reactRouterCoreFlow = getProjectFixturePath("react-router", "core-flow");
const nextAppRouterCoreFlowAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "core-flow-at-scale",
);
const nextAppRouterTypescriptFullCoverageAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "ts-full-coverage-at-scale",
);
const nextAppRouterZodFullCoverageAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "zod-full-coverage-at-scale",
);
const nextAppRouterZodOnlyCoverageAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "zod-only-coverage-at-scale",
);
const nextAppRouterMixedSchemasAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "mixed-schemas-at-scale",
);
const nextAppRouterDrizzleZodAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "drizzle-zod-flow-at-scale",
);
const nextAppRouterIgnoreRoutesAtScale = getProjectFixturePath(
  "next",
  "app-router",
  "ignore-routes-at-scale",
);
const nextPagesRouterCoreFlowAtScale = getProjectFixturePath(
  "next",
  "pages-router",
  "core-flow-at-scale",
);
const nextPagesRouterZodFlowAtScale = getProjectFixturePath(
  "next",
  "pages-router",
  "zod-flow-at-scale",
);
const tanstackCoreFlowAtScale = getProjectFixturePath("tanstack", "core-flow-at-scale");
const reactRouterCoreFlowAtScale = getProjectFixturePath("react-router", "core-flow-at-scale");

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
  ...createVersionedScenarios({
    idPrefix: "next-app-core",
    fixturePath: nextAppRouterCoreFlow,
    fixtureName: "next/app-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-pages-core",
    fixturePath: nextPagesRouterCoreFlow,
    fixtureName: "next/pages-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "typescript",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-pages-zod",
    fixturePath: nextPagesRouterZodFlow,
    fixtureName: "next/pages-router/zod-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "zod",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-mixed",
    fixturePath: nextAppRouterMixedSchemas,
    fixtureName: "next/app-router/mixed-schemas",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "mixed",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-zod",
    fixturePath: nextAppRouterZodOnlyCoverage,
    fixtureName: "next/app-router/zod-only-coverage",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "zod",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-zod-full",
    fixturePath: nextAppRouterZodFullCoverage,
    fixtureName: "next/app-router/zod-full-coverage",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "zod",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-ts-full",
    fixturePath: nextAppRouterTypescriptFullCoverage,
    fixtureName: "next/app-router/ts-full-coverage",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-drizzle-zod",
    fixturePath: nextAppRouterDrizzleZod,
    fixtureName: "next/app-router/drizzle-zod-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "drizzle-zod",
  }),
  ...createVersionedScenarios({
    idPrefix: "next-app-ignore",
    fixturePath: nextAppRouterIgnoreRoutes,
    fixtureName: "next/app-router/ignore-routes",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "filtered",
    templateOverrides: {
      ignoreRoutes: ["/admin/*", "/debug", "/public/info"],
      includeOpenApiRoutes: true,
    },
  }),
  ...createVersionedScenarios({
    idPrefix: "tanstack-core",
    fixturePath: tanstackCoreFlow,
    fixtureName: "tanstack/core-flow",
    packageEntry: "./vite",
    frameworkKind: FrameworkKind.Tanstack,
    router: "generic",
    schemaFlavor: "typescript",
  }),
  ...createVersionedScenarios({
    idPrefix: "react-router-core",
    fixturePath: reactRouterCoreFlow,
    fixtureName: "react-router/core-flow",
    packageEntry: "./react-router",
    frameworkKind: FrameworkKind.ReactRouter,
    router: "generic",
    schemaFlavor: "typescript",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-core-scale",
    fixturePath: nextAppRouterCoreFlowAtScale,
    fixtureName: "next/app-router/core-flow-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-ts-full-scale",
    fixturePath: nextAppRouterTypescriptFullCoverageAtScale,
    fixtureName: "next/app-router/ts-full-coverage-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-zod-full-scale",
    fixturePath: nextAppRouterZodFullCoverageAtScale,
    fixtureName: "next/app-router/zod-full-coverage-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "zod",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-zod-scale",
    fixturePath: nextAppRouterZodOnlyCoverageAtScale,
    fixtureName: "next/app-router/zod-only-coverage-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "zod",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-mixed-scale",
    fixturePath: nextAppRouterMixedSchemasAtScale,
    fixtureName: "next/app-router/mixed-schemas-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "mixed",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-drizzle-zod-scale",
    fixturePath: nextAppRouterDrizzleZodAtScale,
    fixtureName: "next/app-router/drizzle-zod-flow-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "drizzle-zod",
  }),
  ...createScaleScenarios({
    idPrefix: "next-app-ignore-scale",
    fixturePath: nextAppRouterIgnoreRoutesAtScale,
    fixtureName: "next/app-router/ignore-routes-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "filtered",
    templateOverrides: {
      ignoreRoutes: ["/admin/*", "/debug", "/public/info"],
      includeOpenApiRoutes: true,
    },
  }),
  ...createScaleScenarios({
    idPrefix: "next-pages-core-scale",
    fixturePath: nextPagesRouterCoreFlowAtScale,
    fixtureName: "next/pages-router/core-flow-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "typescript",
  }),
  ...createScaleScenarios({
    idPrefix: "next-pages-zod-scale",
    fixturePath: nextPagesRouterZodFlowAtScale,
    fixtureName: "next/pages-router/zod-flow-at-scale",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "zod",
  }),
  ...createScaleScenarios({
    idPrefix: "tanstack-core-scale",
    fixturePath: tanstackCoreFlowAtScale,
    fixtureName: "tanstack/core-flow-at-scale",
    packageEntry: "./vite",
    frameworkKind: FrameworkKind.Tanstack,
    router: "generic",
    schemaFlavor: "typescript",
  }),
  ...createScaleScenarios({
    idPrefix: "react-router-core-scale",
    fixturePath: reactRouterCoreFlowAtScale,
    fixtureName: "react-router/core-flow-at-scale",
    packageEntry: "./react-router",
    frameworkKind: FrameworkKind.ReactRouter,
    router: "generic",
    schemaFlavor: "typescript",
  }),
] as const;

export function getBenchmarkScenarios(mode: BenchmarkMode): BenchmarkScenario[] {
  return BENCHMARK_SCENARIOS.filter((scenario) => scenario.modes.includes(mode));
}

export function createBenchProjects(
  scenarios: readonly BenchmarkScenario[],
): Map<string, BenchProject> {
  const projects = new Map<string, BenchProject>();

  scenarios.forEach((scenario) => {
    const project = copyProjectFixture(scenario.fixturePath);
    const templatePath = materializeTemplateVariant(
      project.root,
      scenario.openapiVersion,
      scenario.templateOverrides,
    );
    projects.set(scenario.id, {
      scenario,
      project,
      templatePath,
    });
  });

  return projects;
}

export function cleanupBenchProjects(projects: Iterable<BenchProject>): void {
  for (const project of projects) {
    project.project.cleanup();
  }
}

export function runColdGeneration(project: BenchProject): OpenApiDocument {
  return withProjectCwd(project.project.root, () => {
    const generator = new OpenApiGenerator({ templatePath: project.templatePath });
    const spec = generator.generate();
    assertSpecHasPaths(spec, project.scenario.id);
    return spec;
  });
}

export function runWarmGeneration(project: BenchProject): OpenApiDocument {
  return withProjectCwd(project.project.root, () => {
    const runtime = createSharedGenerationRuntime();
    const coldGenerator = new OpenApiGenerator({ templatePath: project.templatePath, runtime });
    coldGenerator.generate();

    const warmGenerator = new OpenApiGenerator({
      templatePath: project.templatePath,
      runtime,
    });
    const spec = warmGenerator.generate();
    assertSpecHasPaths(spec, project.scenario.id);
    return spec;
  });
}

export function collectProfiles(
  project: BenchProject,
  iterations: number,
): GeneratorPerformanceProfile[] {
  return Array.from({ length: iterations }, () =>
    withProjectCwd(project.project.root, () => {
      const generator = new OpenApiGenerator({ templatePath: project.templatePath });
      generator.generate();

      const profile = generator.getPerformanceProfile();
      if (!profile) {
        throw new Error(`Expected performance profile for scenario "${project.scenario.id}".`);
      }

      return profile;
    }),
  );
}

export function collectWarmProfiles(
  project: BenchProject,
  iterations: number,
): GeneratorPerformanceProfile[] {
  return Array.from({ length: iterations }, () =>
    withProjectCwd(project.project.root, () => {
      const runtime = createSharedGenerationRuntime();
      const coldGenerator = new OpenApiGenerator({ templatePath: project.templatePath, runtime });
      coldGenerator.generate();

      const warmGenerator = new OpenApiGenerator({ templatePath: project.templatePath, runtime });
      warmGenerator.generate();

      const profile = warmGenerator.getPerformanceProfile();
      if (!profile) {
        throw new Error(`Expected warm performance profile for scenario "${project.scenario.id}".`);
      }

      return profile;
    }),
  );
}

export function getScenarioBenchmarkName(scenario: BenchmarkScenario): string {
  return [
    scenario.packageEntry,
    scenario.frameworkKind,
    scenario.router,
    scenario.schemaFlavor,
    scenario.openapiVersion,
    scenario.fixtureName,
  ].join(" | ");
}

function assertSpecHasPaths(spec: OpenApiDocument, scenarioId: string): void {
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error(`Expected generated spec to include paths for scenario "${scenarioId}".`);
  }
}

function createVersionedScenarios(
  definition: VersionedScenarioDefinition,
): readonly BenchmarkScenario[] {
  return BENCHMARK_VERSIONS.map((openapiVersion) => ({
    ...definition,
    id: `${definition.idPrefix}-${openapiVersion}`,
    openapiVersion,
    modes: BENCHMARK_MODES,
  }));
}

function createScaleScenarios(
  definition: VersionedScenarioDefinition,
): readonly BenchmarkScenario[] {
  return [
    {
      ...definition,
      id: `${definition.idPrefix}-3.2`,
      openapiVersion: "3.2",
      modes: ["scale"],
    },
  ];
}
