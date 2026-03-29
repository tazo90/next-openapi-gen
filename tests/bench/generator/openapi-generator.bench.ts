import { afterAll, beforeAll, bench, describe } from "vitest";

import {
  cleanupBenchProjects,
  createBenchProjects,
  getBenchmarkScenarios,
  getScenarioBenchmarkName,
  runColdGeneration,
  type BenchProject,
} from "./benchmark-matrix.js";

describe("OpenApiGenerator benchmarks", () => {
  const scenarios = getBenchmarkScenarios("cold");
  let projects: Map<string, BenchProject>;

  beforeAll(() => {
    projects = createBenchProjects(scenarios);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  scenarios.forEach((scenario) => {
    bench(getScenarioBenchmarkName(scenario), () => {
      runColdGeneration(projects.get(scenario.id)!);
    });
  });
});
