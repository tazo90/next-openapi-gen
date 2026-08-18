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

  it("filters +server files, strips the segment, and ignores named exports", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-generic-server-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "api", "users", "[id]", "+server.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export const prerender = false;
export async function GET() {}
export async function POST() {}
`,
    );

    const source = new GenericRouteSource(createGenericConfig(tempDir), {
      fileNameFilter: /^\+server\.(t|j)sx?$/,
      stripSegments: ["+server"],
      ignoreExportNames: ["prerender"],
      httpExports: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    });

    expect(source.shouldProcessFile("+server.ts")).toBe(true);
    expect(source.shouldProcessFile("page.ts")).toBe(false);
    expect(source.getRoutePath(filePath)).toBe("/api/users/{id}");
    expect(source.processFile(filePath).map((route) => route.method)).toEqual(["GET", "POST"]);
  });

  it("reads Nitro filename methods and expands Remix action switches", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-generic-methods-"));
    tempDirs.push(tempDir);
    const nitroPath = path.join(tempDir, "[id].put.ts");
    fs.writeFileSync(
      nitroPath,
      `export default defineEventHandler(async (event) => {
  return await readBody(event);
});
`,
    );
    const remixPath = path.join(tempDir, "api.users.$id.ts");
    fs.writeFileSync(
      remixPath,
      `export async function action({ request }: { request: Request }) {
  switch (request.method) {
    case "PUT":
      return null;
    case "DELETE":
      return null;
    default:
      return null;
  }
}
`,
    );

    const unspecifiedPath = path.join(tempDir, "users.ts");
    fs.writeFileSync(unspecifiedPath, "export default defineEventHandler(() => ({ ok: true }));\n");

    const nitro = new GenericRouteSource(createGenericConfig(tempDir), {
      methodFromFilename: true,
    });
    expect(nitro.getRoutePath(nitroPath)).toBe("/{id}");
    expect(nitro.precheckFile(nitroPath)).toBe(true);
    expect(nitro.processFile(nitroPath)).toEqual([
      expect.objectContaining({ method: "PUT", routePath: "/{id}" }),
    ]);
    expect(nitro.processFile(unspecifiedPath)[0]).toMatchObject({
      method: "GET",
      routePath: "/users",
      dataTypes: {
        diagnostics: [expect.objectContaining({ code: "unspecified-http-method" })],
      },
    });

    const remix = new GenericRouteSource(createGenericConfig(tempDir), {
      expandActionMethods: true,
    });
    expect(
      remix
        .processFile(remixPath)
        .map((route) => route.method)
        .toSorted(),
    ).toEqual(["DELETE", "PUT"]);
  });
});

function createGenericConfig(apiDir: string) {
  return {
    apiDir,
    routerType: "app" as const,
    schemaDir: apiDir,
    docsUrl: "api-docs",
    ui: "scalar",
    outputFile: "openapi.json",
    outputDir: "./public",
    includeOpenApiRoutes: false,
    ignoreRoutes: [],
    schemaType: "typescript" as const,
    schemaBackends: ["typescript" as const],
    schemaFiles: [],
    framework: {
      kind: FrameworkKind.ReactRouter,
    },
    next: {},
    diagnostics: { enabled: true },
    openapiVersion: "3.1" as const,
    debug: false,
  };
}
