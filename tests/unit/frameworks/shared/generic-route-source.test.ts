import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GenericRouteSource } from "@workspace/openapi-core/frameworks/shared/generic-route-source.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";

describe("GenericRouteSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("maps loader and action exports to GET and POST routes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-generic-source-"));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, "users.$id.ts");
    fs.writeFileSync(
      filePath,
      `/** Load user */
export async function loader() {}

/** Update user */
export const action = async () => {};`,
    );

    const source = new GenericRouteSource({
      apiDir: tempDir,
      routerType: "app",
      schemaDir: tempDir,
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: [],
      schemaType: "typescript",
      schemaBackends: ["typescript"],
      schemaFiles: [],
      framework: {
        kind: FrameworkKind.ReactRouter,
      },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.1",
      debug: false,
    });

    expect(source.getRoutePath(filePath)).toBe("/users/{id}");
    expect(source.processFile(filePath)).toEqual([
      expect.objectContaining({
        method: "GET",
        routePath: "/users/{id}",
      }),
      expect.objectContaining({
        method: "POST",
        routePath: "/users/{id}",
      }),
    ]);
  });

  it("throws when the file is outside apiDir and skips unmarked OpenAPI routes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-generic-source-edges-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "api");
    fs.mkdirSync(path.join(apiDir, "(group)"), { recursive: true });
    const filePath = path.join(apiDir, "(group)", "health.ts");
    fs.writeFileSync(
      filePath,
      `export const unused = 1;
export async function GET() {}
export { GET as copied };
`,
    );

    const source = new GenericRouteSource({
      apiDir,
      routerType: "app",
      schemaDir: apiDir,
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: true,
      ignoreRoutes: [],
      schemaType: "typescript",
      schemaBackends: ["typescript"],
      schemaFiles: [],
      framework: {
        kind: FrameworkKind.ReactRouter,
      },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.1",
      debug: false,
    });

    expect(() => source.getRoutePath(path.join(tempDir, "outside.ts"))).toThrow(
      /Could not find apiDir/,
    );
    expect(source.precheckFile(filePath)).toBe(false);
    expect(source.getRoutePath(filePath)).toBe("/health");
    expect(source.shouldProcessFile("health.js")).toBe(false);

    const grouped = new GenericRouteSource({
      apiDir,
      routerType: "app",
      schemaDir: apiDir,
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: [],
      schemaType: "typescript",
      schemaBackends: ["typescript"],
      schemaFiles: [],
      framework: {
        kind: FrameworkKind.ReactRouter,
      },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.1",
      debug: false,
    });
    expect(grouped.getRoutePath(filePath)).toBe("/health");

    const noGroups = new GenericRouteSource(
      {
        apiDir,
        routerType: "app",
        schemaDir: apiDir,
        docsUrl: "api-docs",
        ui: "scalar",
        outputFile: "openapi.json",
        outputDir: "./public",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        schemaType: "typescript",
        schemaBackends: ["typescript"],
        schemaFiles: [],
        framework: {
          kind: FrameworkKind.ReactRouter,
        },
        next: {},
        diagnostics: { enabled: true },
        openapiVersion: "3.1",
        debug: false,
      },
      { routeGroups: false, fileExtensions: [".ts", ".js"] },
    );
    expect(noGroups.getRoutePath(filePath)).toBe("/(group)/health");
    expect(noGroups.shouldProcessFile("health.js")).toBe(true);
    expect(noGroups.processFile(filePath).map((route) => route.method)).toEqual(["GET"]);
    expect(noGroups.processFile(filePath).map((route) => route.method)).toEqual(["GET"]);
  });
});
