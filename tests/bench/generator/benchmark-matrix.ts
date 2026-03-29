import { createSharedGenerationRuntime } from "@workspace/openapi-core/core/runtime.js";
import {
  FrameworkKind,
  type OpenApiVersion,
  type RouterType,
} from "@workspace/openapi-core/shared/types.js";
import {
  OpenApiGenerator,
  type GeneratorPerformanceProfile,
  type OpenApiDocument,
} from "next-openapi-gen";

import {
  copyProjectFixture,
  getProjectFixturePath,
  materializeTemplateVariant,
  type TempProject,
  withProjectCwd,
} from "../../helpers/test-project.js";

export type BenchmarkOpenApiVersion = Extract<OpenApiVersion, "3.0" | "3.1" | "3.2">;
export type BenchmarkSchemaFlavor = "typescript" | "zod" | "mixed" | "filtered";
export type BenchmarkPackageEntry = "." | "./next" | "./vite" | "./react-router";
export type BenchmarkRouterKind = RouterType | "generic";
export type BenchmarkMode = "cold" | "warm" | "profile";

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
};

export type BenchProject = {
  scenario: BenchmarkScenario;
  project: TempProject;
  templatePath: string;
};

const nextAppRouterCoreFlow = getProjectFixturePath("next", "app-router", "core-flow");
const nextAppRouterIgnoreRoutes = getProjectFixturePath("next", "app-router", "ignore-routes");
const nextAppRouterMixedSchemas = getProjectFixturePath("next", "app-router", "mixed-schemas");
const nextAppRouterZodOnlyCoverage = getProjectFixturePath(
  "next",
  "app-router",
  "zod-only-coverage",
);
const nextPagesRouterCoreFlow = getProjectFixturePath("next", "pages-router", "core-flow");
const nextPagesRouterZodFlow = getProjectFixturePath("next", "pages-router", "zod-flow");
const tanstackCoreFlow = getProjectFixturePath("tanstack", "core-flow");
const reactRouterCoreFlow = getProjectFixturePath("react-router", "core-flow");

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
  {
    id: "next-app-core-3.0",
    fixturePath: nextAppRouterCoreFlow,
    fixtureName: "next/app-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
    openapiVersion: "3.0",
    modes: ["cold", "warm", "profile"],
  },
  {
    id: "next-app-core-3.1",
    fixturePath: nextAppRouterCoreFlow,
    fixtureName: "next/app-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
    openapiVersion: "3.1",
    modes: ["cold", "profile"],
  },
  {
    id: "next-app-core-3.2",
    fixturePath: nextAppRouterCoreFlow,
    fixtureName: "next/app-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "typescript",
    openapiVersion: "3.2",
    modes: ["cold", "profile"],
  },
  {
    id: "next-pages-core-3.0",
    fixturePath: nextPagesRouterCoreFlow,
    fixtureName: "next/pages-router/core-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "typescript",
    openapiVersion: "3.0",
    modes: ["cold", "warm", "profile"],
  },
  {
    id: "next-pages-zod-3.2",
    fixturePath: nextPagesRouterZodFlow,
    fixtureName: "next/pages-router/zod-flow",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "pages",
    schemaFlavor: "zod",
    openapiVersion: "3.2",
    modes: ["cold", "profile"],
  },
  {
    id: "next-app-mixed-3.1",
    fixturePath: nextAppRouterMixedSchemas,
    fixtureName: "next/app-router/mixed-schemas",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "mixed",
    openapiVersion: "3.1",
    modes: ["cold", "profile"],
  },
  {
    id: "next-app-zod-3.2",
    fixturePath: nextAppRouterZodOnlyCoverage,
    fixtureName: "next/app-router/zod-only-coverage",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "zod",
    openapiVersion: "3.2",
    modes: ["cold", "profile"],
  },
  {
    id: "next-app-ignore-3.0",
    fixturePath: nextAppRouterIgnoreRoutes,
    fixtureName: "next/app-router/ignore-routes",
    packageEntry: "./next",
    frameworkKind: FrameworkKind.Nextjs,
    router: "app",
    schemaFlavor: "filtered",
    openapiVersion: "3.0",
    modes: ["cold", "profile"],
  },
  {
    id: "tanstack-core-3.0",
    fixturePath: tanstackCoreFlow,
    fixtureName: "tanstack/core-flow",
    packageEntry: "./vite",
    frameworkKind: FrameworkKind.Tanstack,
    router: "generic",
    schemaFlavor: "typescript",
    openapiVersion: "3.0",
    modes: ["cold", "warm", "profile"],
  },
  {
    id: "react-router-core-3.0",
    fixturePath: reactRouterCoreFlow,
    fixtureName: "react-router/core-flow",
    packageEntry: "./react-router",
    frameworkKind: FrameworkKind.ReactRouter,
    router: "generic",
    schemaFlavor: "typescript",
    openapiVersion: "3.0",
    modes: ["cold", "warm", "profile"],
  },
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
    const templatePath = materializeTemplateVariant(project.root, scenario.openapiVersion);
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
