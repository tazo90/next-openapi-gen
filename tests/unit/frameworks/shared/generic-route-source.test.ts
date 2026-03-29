import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GenericRouteSource } from "@next-openapi-gen/frameworks/shared/generic-route-source.js";
import { FrameworkKind } from "@next-openapi-gen/shared/types.js";

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
});
