import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createNuxtFrameworkSource } from "@workspace/openapi-framework-nuxt/frameworks/nuxt/source.js";

describe("createNuxtFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("uses Nitro filename suffixes as HTTP methods", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-nuxt-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "users", "[id].get.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "export default defineEventHandler(() => ({ id: 1 }));\n");

    const source = createNuxtFrameworkSource({
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
      framework: { kind: FrameworkKind.Nuxt },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.getRoutePath(filePath)).toBe("/users/{id}");
    expect(source.processFile(filePath)).toEqual([
      expect.objectContaining({ method: "GET", routePath: "/users/{id}" }),
    ]);
  });
});
