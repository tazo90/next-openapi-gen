import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GeneratorPerformanceProfile } from "next-openapi-gen";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupBenchProjects,
  collectProfiles,
  collectWarmProfiles,
  createBenchProjects,
  getBenchmarkScenarios,
  type BenchProject,
} from "./benchmark-matrix.js";

type GeneratorBenchMode = "cold" | "warm";

type GeneratorBenchSummary = {
  id: string;
  fixture: string;
  framework: string;
  mode: GeneratorBenchMode;
  openapiVersion: string;
  packageEntry: string;
  profile: GeneratorPerformanceProfile;
  router: string;
  schemaFlavor: string;
  topPhases: Array<{
    name: keyof GeneratorPerformanceProfile;
    ms: number;
  }>;
};

type GeneratorBenchReport = {
  generatedAt: string;
  iterations: number;
  machine: {
    arch: string;
    cpus: number;
    model: string;
    node: string;
    platform: NodeJS.Platform;
    release: string;
  };
  scenarios: GeneratorBenchSummary[];
};

const reportFilePath =
  process.env.GENERATOR_BENCH_OUTPUT ?? getRepoPath("tests/bench/generator/current.json");
const iterations = Number(process.env.GENERATOR_BENCH_ITERATIONS ?? "3");

function average(values: number[]): number {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function averageProfile(profiles: GeneratorPerformanceProfile[]): GeneratorPerformanceProfile {
  const profileKeys = Object.keys(profiles[0] ?? {}) as Array<keyof GeneratorPerformanceProfile>;
  return Object.fromEntries(
    profileKeys.map((key) => [key, average(profiles.map((profile) => profile[key]))]),
  ) as GeneratorPerformanceProfile;
}

function summarizeProject(
  project: BenchProject,
  mode: GeneratorBenchMode,
  profiles: GeneratorPerformanceProfile[],
): GeneratorBenchSummary {
  const profile = averageProfile(profiles);
  return {
    id: project.scenario.id,
    fixture: project.scenario.fixtureName,
    framework: project.scenario.frameworkKind,
    mode,
    openapiVersion: project.scenario.openapiVersion,
    packageEntry: project.scenario.packageEntry,
    profile,
    router: project.scenario.router,
    schemaFlavor: project.scenario.schemaFlavor,
    topPhases: getTopPhases(profile),
  };
}

function getTopPhases(profile: GeneratorPerformanceProfile): GeneratorBenchSummary["topPhases"] {
  return (Object.entries(profile) as Array<[keyof GeneratorPerformanceProfile, number]>)
    .filter(([key]) => key !== "totalMs")
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, ms]) => ({ name, ms }));
}

function createReport(projects: Map<string, BenchProject>): GeneratorBenchReport {
  const scenarios = getBenchmarkScenarios("profile");
  const cpu = os.cpus()[0];
  return {
    generatedAt: new Date().toISOString(),
    iterations,
    machine: {
      arch: os.arch(),
      cpus: Math.max(1, os.cpus().length),
      model: cpu?.model ?? "unknown",
      node: process.version,
      platform: process.platform,
      release: os.release(),
    },
    scenarios: scenarios.flatMap((scenario) => {
      const project = projects.get(scenario.id)!;
      return [
        summarizeProject(project, "cold", collectProfiles(project, iterations)),
        summarizeProject(project, "warm", collectWarmProfiles(project, iterations)),
      ];
    }),
  };
}

function getRepoPath(...segments: string[]): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ...segments);
}

describe.sequential("OpenApiGenerator benchmark report", () => {
  const scenarios = getBenchmarkScenarios("profile");
  let projects: Map<string, BenchProject>;

  beforeAll(() => {
    projects = createBenchProjects(scenarios);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  it("writes cold and warm generator timing summaries", () => {
    const report = createReport(projects);
    fs.mkdirSync(path.dirname(reportFilePath), { recursive: true });
    fs.writeFileSync(reportFilePath, `${JSON.stringify(report, null, 2)}\n`);

    expect(report.scenarios.length).toBe(scenarios.length * 2);
    for (const scenario of report.scenarios) {
      expect(scenario.profile.totalMs).toBeGreaterThan(0);
    }
  });
});
