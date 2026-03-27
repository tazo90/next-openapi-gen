import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { scanRouteFiles } from "@next-openapi-gen/routes/route-scanner.js";
import type { FrameworkAdapter } from "@next-openapi-gen/frameworks/types.js";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nxog-route-scanner-"));
}

describe("scanRouteFiles", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("recursively scans directories and only processes adapter-matching files once", () => {
    const root = createTempDir();
    roots.push(root);

    fs.mkdirSync(path.join(root, "users"), { recursive: true });
    fs.mkdirSync(path.join(root, "admin"), { recursive: true });
    fs.writeFileSync(path.join(root, "users", "route.ts"), "");
    fs.writeFileSync(path.join(root, "users", "route.tsx"), "");
    fs.writeFileSync(path.join(root, "admin", "index.ts"), "");

    const adapter = {
      shouldProcessFile(fileName: string) {
        return fileName === "route.ts" || fileName === "route.tsx";
      },
    } as FrameworkAdapter;

    const state = {
      directoryCache: {},
      statCache: {},
      processFileTracker: {},
    };

    const visited: string[] = [];

    scanRouteFiles(root, adapter, state, (filePath) => {
      visited.push(filePath);
    });

    scanRouteFiles(root, adapter, state, (filePath) => {
      visited.push(filePath);
    });

    expect(visited).toHaveLength(2);
    expect(visited.every((filePath) => filePath.includes("route.ts"))).toBe(true);
  });

  it("reuses directory and stat caches between scans", () => {
    const root = createTempDir();
    roots.push(root);

    fs.mkdirSync(path.join(root, "users"), { recursive: true });
    fs.writeFileSync(path.join(root, "users", "route.ts"), "");

    const adapter = {
      shouldProcessFile: (fileName: string) => fileName === "route.ts",
    } as FrameworkAdapter;

    const state = {
      directoryCache: {},
      statCache: {},
      processFileTracker: {},
    };

    const readdirSpy = vi.spyOn(fs, "readdirSync");
    const statSpy = vi.spyOn(fs, "statSync");

    scanRouteFiles(root, adapter, state, () => {});
    scanRouteFiles(root, adapter, state, () => {});

    expect(readdirSpy).toHaveBeenCalledTimes(2);
    expect(statSpy).toHaveBeenCalledTimes(2);
  });
});
