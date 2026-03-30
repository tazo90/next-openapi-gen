import { afterAll, beforeAll, bench, describe } from "vitest";

import {
  cleanupBenchProjects,
  createBenchProjects,
  getBenchmarkScenarios,
  getScenarioBenchmarkName,
  runWarmGeneration,
  type BenchProject,
} from "./benchmark-matrix.js";

describe("OpenApiGenerator warm benchmarks", () => {
  const scenarios = getBenchmarkScenarios("warm");
  let projects: Map<string, BenchProject>;

  beforeAll(() => {
    projects = createBenchProjects(scenarios);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  scenarios.forEach((scenario) => {
    bench(getScenarioBenchmarkName(scenario), () => {
      runWarmGeneration(projects.get(scenario.id)!);
    });
  });
});
