import { afterAll, beforeAll, bench, describe } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";

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
const mixedSchemasFixture = getProjectFixturePath("next", "app-router", "mixed-schemas");

function createBenchProject(fixturePath: string): BenchProject {
  const project = copyProjectFixture(fixturePath);
  const templatePath = materializeTemplateVariant(project.root, "3.0");

  return {
    project,
    templatePath,
  };
}

function runGenerator(project: BenchProject): void {
  withProjectCwd(project.project.root, () => {
    const generator = new OpenApiGenerator({ templatePath: project.templatePath });
    const spec = generator.generate();

    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      throw new Error("Expected generated spec to include paths.");
    }
  });
}

describe("OpenApiGenerator benchmarks", () => {
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

  bench("generates app-router core-flow fixture", () => {
    runGenerator(coreFlowProject);
  });

  bench("generates mixed-schemas fixture", () => {
    runGenerator(mixedSchemasProject);
  });
});
