import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createExpressFrameworkSource } from "@workspace/openapi-framework-express/frameworks/express/source.js";

describe("createExpressFrameworkSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("discovers Express app methods and chained route() calls", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-express-source-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "index.ts");
    fs.writeFileSync(
      filePath,
      `import express from "express";
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.route("/users/:id").put(() => undefined).delete(() => undefined);
export default app;
`,
    );

    const source = createExpressFrameworkSource({
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
      framework: { kind: FrameworkKind.Express, modulePath: filePath },
      next: {},
      diagnostics: { enabled: true },
      openapiVersion: "3.0",
      debug: false,
    });

    expect(
      source
        .processFile(filePath)
        .map((route) => `${route.method} ${route.routePath}`)
        .toSorted(),
    ).toEqual(["DELETE /users/{id}", "GET /health", "PUT /users/{id}"]);
  });
});
