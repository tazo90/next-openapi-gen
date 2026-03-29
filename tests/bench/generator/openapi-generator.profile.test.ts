import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GeneratorPerformanceProfile } from "next-openapi-gen";

import {
  cleanupBenchProjects,
  collectProfiles,
  createBenchProjects,
  getBenchmarkScenarios,
  type BenchProject,
} from "./benchmark-matrix.js";

type ProfileSummary = GeneratorPerformanceProfile & {
  fixture: string;
  packageEntry: string;
  framework: string;
  router: string;
  schemaFlavor: string;
  openapiVersion: string;
};

const ITERATIONS = 5;

function average(values: number[]): number {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function summarizeProfiles(
  project: BenchProject,
  profiles: GeneratorPerformanceProfile[],
): ProfileSummary {
  return {
    fixture: project.scenario.fixtureName,
    packageEntry: project.scenario.packageEntry,
    framework: project.scenario.frameworkKind,
    router: project.scenario.router,
    schemaFlavor: project.scenario.schemaFlavor,
    openapiVersion: project.scenario.openapiVersion,
    prepareTemplateMs: average(profiles.map((profile) => profile.prepareTemplateMs)),
    loadCustomFragmentsMs: average(profiles.map((profile) => profile.loadCustomFragmentsMs)),
    prepareDocumentMs: average(profiles.map((profile) => profile.prepareDocumentMs)),
    scanRouteFilesMs: average(profiles.map((profile) => profile.scanRouteFilesMs)),
    deriveRoutePathMs: average(profiles.map((profile) => profile.deriveRoutePathMs)),
    filterRouteCandidatesMs: average(profiles.map((profile) => profile.filterRouteCandidatesMs)),
    sourcePrecheckMs: average(profiles.map((profile) => profile.sourcePrecheckMs)),
    readRouteFilesMs: average(profiles.map((profile) => profile.readRouteFilesMs)),
    parseRouteFilesMs: average(profiles.map((profile) => profile.parseRouteFilesMs)),
    analyzeRouteFilesMs: average(profiles.map((profile) => profile.analyzeRouteFilesMs)),
    typescriptResponseInferenceMs: average(
      profiles.map((profile) => profile.typescriptResponseInferenceMs),
    ),
    processRouteFilesMs: average(profiles.map((profile) => profile.processRouteFilesMs)),
    registerRouteMs: average(profiles.map((profile) => profile.registerRouteMs)),
    getSchemaContentMs: average(profiles.map((profile) => profile.getSchemaContentMs)),
    createRequestParamsMs: average(profiles.map((profile) => profile.createRequestParamsMs)),
    createRequestBodyMs: average(profiles.map((profile) => profile.createRequestBodyMs)),
    processResponsesMs: average(profiles.map((profile) => profile.processResponsesMs)),
    createResponseSchemaMs: average(profiles.map((profile) => profile.createResponseSchemaMs)),
    buildOperationsMs: average(profiles.map((profile) => profile.buildOperationsMs)),
    scanRoutesMs: average(profiles.map((profile) => profile.scanRoutesMs)),
    sortAndMergePathsMs: average(profiles.map((profile) => profile.sortAndMergePathsMs)),
    buildPathsMs: average(profiles.map((profile) => profile.buildPathsMs)),
    defaultComponentsAndErrorsMs: average(
      profiles.map((profile) => profile.defaultComponentsAndErrorsMs),
    ),
    mergeSchemasMs: average(profiles.map((profile) => profile.mergeSchemasMs)),
    finalizeDocumentMs: average(profiles.map((profile) => profile.finalizeDocumentMs)),
    totalMs: average(profiles.map((profile) => profile.totalMs)),
  };
}

describe.sequential("OpenApiGenerator profiling", () => {
  const scenarios = getBenchmarkScenarios("profile");
  let projects: Map<string, BenchProject>;

  beforeAll(() => {
    projects = createBenchProjects(scenarios);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  it("prints stable timing summaries for benchmark fixtures", () => {
    const summaries = scenarios.map((scenario) => {
      const project = projects.get(scenario.id)!;
      return summarizeProfiles(project, collectProfiles(project, ITERATIONS));
    });

    console.table(summaries);

    summaries.forEach((summary) => {
      expect(summary.totalMs).toBeGreaterThan(0);
    });
  });
});
