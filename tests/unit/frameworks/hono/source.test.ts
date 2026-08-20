import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createHonoFrameworkSource } from "@workspace/openapi-framework-hono/frameworks/hono/source.js";

describe("createHonoFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("discovers Hono app.get routes from the module entry", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-hono-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "index.ts");
    fs.writeFileSync(
      filePath,
      `import { Hono } from "hono";
const app = new Hono();
app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
export default app;
`,
    );

    const source = createHonoFrameworkSource({
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
      framework: { kind: FrameworkKind.Hono, modulePath: filePath },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(source.processFile(filePath)).toEqual([
      expect.objectContaining({ method: "GET", routePath: "/users/{id}" }),
    ]);
  });
});
