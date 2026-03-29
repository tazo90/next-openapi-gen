import { afterAll, beforeAll, bench, describe } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";
import { createSharedGenerationRuntime } from "@next-openapi-gen/core/runtime.js";

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

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

function createBenchProject(fixturePath: string): BenchProject {
  const project = copyProjectFixture(fixturePath);
  const templatePath = materializeTemplateVariant(project.root, "3.0");

  return {
    project,
    templatePath,
  };
}

describe("OpenApiGenerator warm benchmarks", () => {
  let coreFlowProject: BenchProject;

  beforeAll(() => {
    coreFlowProject = createBenchProject(appRouterCoreFixture);
  });

  afterAll(() => {
    coreFlowProject.project.cleanup();
  });

  bench("reuses shared runtime across warm generations", () => {
    withProjectCwd(coreFlowProject.project.root, () => {
      const runtime = createSharedGenerationRuntime();
      const generator = new OpenApiGenerator({
        templatePath: coreFlowProject.templatePath,
        runtime,
      });
      generator.generate();

      const warmGenerator = new OpenApiGenerator({
        templatePath: coreFlowProject.templatePath,
        runtime,
      });
      const spec = warmGenerator.generate();

      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        throw new Error("Expected generated spec to include paths.");
      }
    });
  });
});
