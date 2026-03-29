import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createReactRouterFrameworkSource } from "@workspace/openapi-framework-react-router/frameworks/react-router/source.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";

describe("createReactRouterFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("creates a generic source for React Router loader/action files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-react-router-source-"));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, "projects.$projectId.ts");
    fs.writeFileSync(
      filePath,
      `export async function loader() {}
export const action = async () => {};`,
    );

    const source = createReactRouterFrameworkSource({
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
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.processFile(filePath)).toEqual([
      expect.objectContaining({
        method: "GET",
        routePath: "/projects/{projectId}",
      }),
      expect.objectContaining({
        method: "POST",
        routePath: "/projects/{projectId}",
      }),
    ]);
  });
});
