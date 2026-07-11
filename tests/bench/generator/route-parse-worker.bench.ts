import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { parse } from "@babel/parser";
import { afterAll, beforeAll, bench, describe } from "vitest";

import {
  cleanupBenchProjects,
  createBenchProjects,
  getBenchmarkScenarios,
  type BenchProject,
} from "./benchmark-matrix.js";

type RouteSource = {
  filePath: string;
  source: string;
};

const workerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "route-parse-worker.mjs",
);

function collectRouteSources(project: BenchProject): RouteSource[] {
  const apiDir = path.join(project.project.root, "src", "app", "api");
  const sources: RouteSource[] = [];
  collectFiles(apiDir, sources);
  return sources;
}

function collectFiles(dir: string, sources: RouteSource[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(filePath, sources);
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      sources.push({
        filePath,
        source: fs.readFileSync(filePath, "utf-8"),
      });
    }
  }
}

function parseSequentially(sources: RouteSource[]): void {
  for (const { filePath, source } of sources) {
    parse(source, {
      sourceFilename: filePath,
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
    });
  }
}

async function parseWithWorkers(sources: RouteSource[]): Promise<void> {
  const workerCount = Math.max(1, Math.min(sources.length, os.availableParallelism() - 1));
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workerCount }, () => {
      const worker = new Worker(workerPath);
      return new Promise<void>((resolve, reject) => {
        worker.on("message", (message: { ok: boolean; error?: string }) => {
          if (!message.ok) {
            reject(new Error(message.error ?? "Worker route parse failed."));
            void worker.terminate();
            return;
          }
          sendNext();
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Route parse worker exited with ${code}.`));
          }
        });

        function sendNext(): void {
          const source = sources[nextIndex++];
          if (!source) {
            void worker.terminate().then(() => resolve(), reject);
            return;
          }
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker_threads postMessage has no targetOrigin.
          worker.postMessage(source);
        }

        sendNext();
      });
    }),
  );
}

describe("route parse worker prototype", () => {
  const scenario = getBenchmarkScenarios("cold").find(({ id }) => id === "next-app-core-3.2");
  if (!scenario) {
    throw new Error("Missing next-app-core-3.2 benchmark scenario.");
  }
  let projects: Map<string, BenchProject>;
  let sources: RouteSource[];

  beforeAll(() => {
    projects = createBenchProjects([scenario]);
    sources = collectRouteSources(projects.get(scenario.id)!);
  });

  afterAll(() => {
    cleanupBenchProjects(projects.values());
  });

  bench("sequential Babel parse", () => {
    parseSequentially(sources);
  });

  bench("worker pool Babel parse", async () => {
    await parseWithWorkers(sources);
  });
});
