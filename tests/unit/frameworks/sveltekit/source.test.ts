import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createSvelteKitFrameworkSource } from "@workspace/openapi-framework-sveltekit/frameworks/sveltekit/source.js";

describe("createSvelteKitFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("only processes +server files and keeps the public /api prefix", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-sveltekit-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "api", "users", "[id]", "+server.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      "export async function GET() {}\nexport async function PATCH() {}\n",
    );

    const source = createSvelteKitFrameworkSource({
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
      framework: { kind: FrameworkKind.SvelteKit },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.shouldProcessFile("+server.ts")).toBe(true);
    expect(source.shouldProcessFile("+page.server.ts")).toBe(false);
    expect(source.getRoutePath(filePath)).toBe("/api/users/{id}");
    expect(source.processFile(filePath).map((route) => route.method)).toEqual(["GET", "PATCH"]);
  });
});
