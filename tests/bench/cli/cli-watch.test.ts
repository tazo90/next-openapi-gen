import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupBenchProjects,
  createBenchProjects,
  getBenchmarkScenarios,
  type BenchProject,
} from "../generator/benchmark-matrix.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(repoRoot, "packages", "next-openapi-gen", "bin", "cli.mjs");
const builtCliPath = path.join(repoRoot, "packages", "next-openapi-gen", "dist", "cli.js");

function waitForOutput(getOutput: () => string, pattern: RegExp, timeoutMs: number): Promise<void> {
  return waitForCondition(() => pattern.test(getOutput()), timeoutMs, `output matching ${pattern}`);
}

function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (performance.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for ${description}`));
      }
    }, 25);
  });
}

describe.skipIf(!fs.existsSync(builtCliPath))("openapi-gen CLI watch smoke", () => {
  let projects: Map<string, BenchProject>;

  beforeAll(() => {
    const scenario = getBenchmarkScenarios("cold").find(({ id }) => id === "next-app-core-3.2");
    if (!scenario) {
      throw new Error("Missing next-app-core-3.2 benchmark scenario.");
    }
    projects = createBenchProjects([scenario]);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  it("regenerates after a route file changes", async () => {
    const project = projects.get("next-app-core-3.2")!;
    let output = "";
    const child = spawn(process.execPath, [cliPath, "generate", "-w"], {
      cwd: project.project.root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    try {
      await waitForOutput(() => output, /Watching for route and schema changes/, 10_000);

      const changedRoute = path.join(project.project.root, "src/app/api/search/route.ts");
      const before = output.match(/Generated \d+ artifact\(s\)\./g)?.length ?? 0;
      fs.appendFileSync(changedRoute, "\n// benchmark watch touch\n");

      const startedAt = performance.now();
      await waitForCondition(
        () => (output.match(/Generated \d+ artifact\(s\)\./g)?.length ?? 0) > before,
        10_000,
        "watch regeneration",
      );
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeGreaterThan(0);
    } finally {
      child.kill("SIGTERM");
    }
  }, 20_000);
});
