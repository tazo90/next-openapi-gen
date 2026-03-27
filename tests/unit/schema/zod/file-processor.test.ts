import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectRouteFilesInDirectory,
  collectZodRouteFiles,
  processZodSchemaFilesInDirectory,
} from "@next-openapi-gen/schema/zod/file-processor.js";

describe("zod file processor helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("collects route files inside an explicit apiDir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-route-files-"));
    roots.push(root);

    fs.mkdirSync(path.join(root, "users"), { recursive: true });
    fs.writeFileSync(path.join(root, "users", "route.ts"), "");
    fs.writeFileSync(path.join(root, "users", "route.tsx"), "");
    fs.writeFileSync(path.join(root, "users", "api-handler.ts"), "");
    fs.writeFileSync(path.join(root, "users", "helper.ts"), "");

    expect(
      collectZodRouteFiles(root)
        .map((filePath) => path.basename(filePath))
        .sort(),
    ).toEqual(["api-handler.ts", "route.ts", "route.tsx"]);
  });

  it("falls back to known api directories when apiDir is omitted", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-route-fallback-"));
    roots.push(root);

    fs.mkdirSync(path.join(root, "src", "app", "api", "users"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "app", "api", "users", "route.ts"), "");

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const [routeFile] = collectZodRouteFiles();
      expect(routeFile).toBeDefined();
      expect(routeFile?.endsWith(path.join("src", "app", "api", "users", "route.ts"))).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("recursively processes .ts and .tsx schema files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-schema-files-"));
    roots.push(root);

    fs.mkdirSync(path.join(root, "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "schema.ts"), "");
    fs.writeFileSync(path.join(root, "nested", "schema.tsx"), "");
    fs.writeFileSync(path.join(root, "nested", "schema.js"), "");

    const visited: string[] = [];
    processZodSchemaFilesInDirectory(root, (filePath) => {
      visited.push(path.basename(filePath));
    });

    expect(visited.sort()).toEqual(["schema.ts", "schema.tsx"]);
  });

  it("supports direct recursive collection helper", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-route-recursive-"));
    roots.push(root);

    fs.mkdirSync(path.join(root, "admin"), { recursive: true });
    fs.writeFileSync(path.join(root, "admin", "route.ts"), "");

    const routeFiles: string[] = [];
    collectRouteFilesInDirectory(root, routeFiles);

    expect(routeFiles).toEqual([path.join(root, "admin", "route.ts")]);
  });

  it("swallows file system errors while scanning", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(collectZodRouteFiles(path.join(process.cwd(), "missing-api-dir"))).toEqual([]);
    expect(() =>
      processZodSchemaFilesInDirectory(path.join(process.cwd(), "missing-schema-dir"), () => {}),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
  });
});
