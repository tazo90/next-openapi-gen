import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, bench, describe } from "vitest";

import {
  cleanupBenchProjects,
  createBenchProjects,
  getBenchmarkScenarios,
  type BenchProject,
} from "../generator/benchmark-matrix.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(repoRoot, "packages", "next-openapi-gen", "bin", "cli.mjs");
const builtCliPath = path.join(repoRoot, "packages", "next-openapi-gen", "dist", "cli.js");
const scenarioIds = new Set(["next-app-core-3.2", "next-app-zod-full-3.2", "next-app-ts-full-3.2"]);
const scenarios = getBenchmarkScenarios("cold").filter((scenario) => scenarioIds.has(scenario.id));
const subprocessBenchOptions = {
  iterations: 5,
  time: 20_000,
  warmupIterations: 0,
  warmupTime: 0,
};
let projects: Map<string, BenchProject> | undefined;

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
  execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "ignore",
  });
}

function getProject(projects: Map<string, BenchProject>, id: string): BenchProject {
  const project = projects.get(id);
  if (!project) {
    throw new Error(`Missing benchmark project "${id}".`);
  }
  return project;
}

function materializeModernJsonConfig(project: BenchProject): string {
  const modernConfigPath = path.join(project.project.root, "openapi-gen.config.json");
  fs.copyFileSync(project.templatePath, modernConfigPath);
  return modernConfigPath;
}

function getProjects(): Map<string, BenchProject> {
  if (projects) {
    return projects;
  }

  projects = createBenchProjects(scenarios);
  for (const project of projects.values()) {
    materializeModernJsonConfig(project);
  }
  return projects;
}

function createFakePackageManagerBin(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-fake-pm-"));
  const pnpmPath = path.join(binDir, "pnpm");
  fs.writeFileSync(pnpmPath, "#!/usr/bin/env sh\nexit 0\n");
  fs.chmodSync(pnpmPath, 0o755);
  return binDir;
}

function withTempInitProject(callback: (cwd: string, env: NodeJS.ProcessEnv) => void): void {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-cli-init-"));
  const fakeBin = createFakePackageManagerBin();
  try {
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ name: "cli-init-bench", packageManager: "pnpm@11.9.0" }, null, 2)}\n`,
    );
    callback(cwd, {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(builtCliPath))("openapi-gen CLI subprocess benchmarks", () => {
  afterAll(() => {
    if (projects) {
      cleanupBenchProjects(projects.values());
    }
  });

  bench(
    "generate — default config discovery",
    () => {
      runCli(["generate"], getProject(getProjects(), "next-app-core-3.2").project.root);
    },
    subprocessBenchOptions,
  );

  bench(
    "generate — explicit modern JSON config",
    () => {
      runCli(
        ["generate", "-c", "openapi-gen.config.json"],
        getProject(getProjects(), "next-app-zod-full-3.2").project.root,
      );
    },
    subprocessBenchOptions,
  );

  bench(
    "generate — legacy template alias",
    () => {
      runCli(
        ["generate", "-t", "next.openapi.json"],
        getProject(getProjects(), "next-app-ts-full-3.2").project.root,
      );
    },
    subprocessBenchOptions,
  );

  bench(
    "generate — fail-on warning",
    () => {
      runCli(
        ["generate", "-c", "openapi-gen.config.json", "--fail-on", "never"],
        getProject(getProjects(), "next-app-core-3.2").project.root,
      );
    },
    subprocessBenchOptions,
  );

  bench(
    "generate — unchanged disk cache hit",
    () => {
      const root = getProject(getProjects(), "next-app-core-3.2").project.root;
      runCli(["generate", "-c", "openapi-gen.config.json"], root, { OPENAPI_GEN_CACHE: "1" });
      runCli(["generate", "-c", "openapi-gen.config.json"], root, { OPENAPI_GEN_CACHE: "1" });
    },
    subprocessBenchOptions,
  );

  bench(
    "init — next scalar zod",
    () => {
      withTempInitProject((cwd, env) => {
        runCli(["init", "-f", "next", "-i", "scalar", "-s", "zod"], cwd, env);
      });
    },
    subprocessBenchOptions,
  );

  bench(
    "init — react-router no UI typescript",
    () => {
      withTempInitProject((cwd, env) => {
        runCli(["init", "-f", "react-router", "-i", "none", "-s", "typescript"], cwd, env);
      });
    },
    subprocessBenchOptions,
  );
});
