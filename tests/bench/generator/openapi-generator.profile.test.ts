import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";
import type { GeneratorPerformanceProfile } from "@next-openapi-gen/generator/openapi-generator.js";

import {
  copyProjectFixture,
  getProjectFixturePath,
  materializeTemplateVariant,
  type TempProject,
  withProjectCwd,
} from "../../helpers/test-project.js";

type BenchProject = {
  project: TempProject;
  templatePath: string;
};

type ProfileSummary = GeneratorPerformanceProfile & {
  fixture: string;
};

const ITERATIONS = 5;

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");
const mixedSchemasFixture = getProjectFixturePath("next", "app-router", "mixed-schemas");

function createBenchProject(fixturePath: string): BenchProject {
  const project = copyProjectFixture(fixturePath);
  const templatePath = materializeTemplateVariant(project.root, "3.0");

  return {
    project,
    templatePath,
  };
}

function average(values: number[]): number {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function summarizeProfiles(
  fixture: string,
  profiles: GeneratorPerformanceProfile[],
): ProfileSummary {
  return {
    fixture,
    prepareDocumentMs: average(profiles.map((profile) => profile.prepareDocumentMs)),
    scanRoutesMs: average(profiles.map((profile) => profile.scanRoutesMs)),
    buildPathsMs: average(profiles.map((profile) => profile.buildPathsMs)),
    mergeSchemasMs: average(profiles.map((profile) => profile.mergeSchemasMs)),
    finalizeDocumentMs: average(profiles.map((profile) => profile.finalizeDocumentMs)),
    totalMs: average(profiles.map((profile) => profile.totalMs)),
  };
}

function profileFixture(project: BenchProject): GeneratorPerformanceProfile[] {
  return Array.from({ length: ITERATIONS }, () =>
    withProjectCwd(project.project.root, () => {
      const generator = new OpenApiGenerator({ templatePath: project.templatePath });
      generator.generate();

      const profile = generator.getPerformanceProfile();
      if (!profile) {
        throw new Error("Expected generator performance profile to be available.");
      }

      return profile;
    }),
  );
}

describe.sequential("OpenApiGenerator profiling", () => {
  let coreFlowProject: BenchProject;
  let mixedSchemasProject: BenchProject;

  beforeAll(() => {
    coreFlowProject = createBenchProject(appRouterCoreFixture);
    mixedSchemasProject = createBenchProject(mixedSchemasFixture);
  });

  afterAll(() => {
    coreFlowProject.project.cleanup();
    mixedSchemasProject.project.cleanup();
  });

  it("prints stable timing summaries for benchmark fixtures", () => {
    const coreFlowSummary = summarizeProfiles(
      "app-router/core-flow",
      profileFixture(coreFlowProject),
    );
    const mixedSchemasSummary = summarizeProfiles(
      "app-router/mixed-schemas",
      profileFixture(mixedSchemasProject),
    );

    console.table([coreFlowSummary, mixedSchemasSummary]);

    expect(coreFlowSummary.totalMs).toBeGreaterThan(0);
    expect(mixedSchemasSummary.totalMs).toBeGreaterThan(0);
  });
});
