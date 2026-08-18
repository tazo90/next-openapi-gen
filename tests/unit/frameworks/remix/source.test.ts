import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createRemixFrameworkSource } from "@workspace/openapi-framework-remix/frameworks/remix/source.js";

describe("createRemixFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("maps Remix resource routes and action method switches", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-remix-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "api.users.$id.ts");
    fs.writeFileSync(
      filePath,
      `export async function loader() {}
export async function action({ request }: { request: Request }) {
  if (request.method === "PUT") return null;
  if (request.method === "DELETE") return null;
}
`,
    );

    const source = createRemixFrameworkSource({
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
      framework: { kind: FrameworkKind.Remix },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.getRoutePath(filePath)).toBe("/api/users/{id}");
    expect(
      source
        .processFile(filePath)
        .map((route) => route.method)
        .toSorted(),
    ).toEqual(["DELETE", "GET", "PUT"]);
  });
});
