import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createAstroFrameworkSource } from "@workspace/openapi-framework-astro/frameworks/astro/source.js";

describe("createAstroFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("ignores prerender exports on Astro endpoints", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-astro-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "users", "[id].ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export const prerender = false;
export const GET = () => new Response("ok");
export const DELETE = () => new Response(null, { status: 204 });
`,
    );

    const source = createAstroFrameworkSource({
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
      framework: { kind: FrameworkKind.Astro },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.getRoutePath(filePath)).toBe("/users/{id}");
    expect(source.processFile(filePath).map((route) => route.method)).toEqual(["GET", "DELETE"]);
  });
});
