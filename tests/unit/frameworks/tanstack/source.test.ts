import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTanStackFrameworkSource } from "@next-openapi-gen/frameworks/tanstack/source.js";
import { FrameworkKind } from "@next-openapi-gen/shared/types.js";

describe("createTanStackFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("creates a generic source for Vite-style route files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-tanstack-source-"));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, "users.$id.ts");
    fs.writeFileSync(filePath, "export async function loader() {}");

    const source = createTanStackFrameworkSource({
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
        kind: FrameworkKind.Tanstack,
      },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.getRoutePath(filePath)).toBe("/users/{id}");
    expect(source.processFile(filePath)).toEqual([
      expect.objectContaining({
        method: "GET",
        routePath: "/users/{id}",
      }),
    ]);
  });
});
