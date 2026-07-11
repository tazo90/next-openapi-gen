import fs from "node:fs";
import path from "node:path";

import { OpenApiGenerator } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

describe("diagnostics matrix", () => {
  it("emits stable diagnostics with locations and suggested fixes", () => {
    const project = createTempProject("nxog-diagnostics-matrix-");

    try {
      writeOpenApiTemplate(project.root, {
        schemaType: ["zod", "typescript"],
      });
      writeAppRoute(
        project.root,
        ["missing", "[id]"],
        `export async function GET() {
  return Response.json({ ok: true });
}
`,
      );
      writeAppRoute(
        project.root,
        ["query"],
        `export async function GET(request: Request) {
  const url = new URL(request.url);
  url.searchParams.get("q");
  return Response.json({ ok: true });
}
`,
      );
      writeAppRoute(
        project.root,
        ["schema-not-found"],
        `/**
 * @response MissingResponse
 */
export async function GET() {}
`,
      );
      writeAppRoute(
        project.root,
        ["unknown-zod"],
        `import { z } from "zod/v4";

export const UnknownSchema = z.mystery();

/**
 * @response UnknownSchema
 */
export async function GET() {}
`,
      );

      const diagnostics = withProjectCwd(project.root, () => {
        const generator = new OpenApiGenerator({ templatePath: "next.openapi.json" });
        generator.generate();
        return generator.getDiagnostics();
      });

      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing-path-params-type",
            filePath: expect.stringContaining(path.join("missing", "[id]", "route.ts")),
            routePath: "/missing/{id}",
            metadata: expect.objectContaining({
              suggestedFix: expect.any(String),
            }),
          }),
          expect.objectContaining({
            code: "missing-query-params-type",
            filePath: expect.stringContaining(path.join("query", "route.ts")),
            routePath: "/query",
            metadata: expect.objectContaining({
              suggestedFix: expect.any(String),
            }),
          }),
          expect.objectContaining({
            code: "schema-not-found",
            filePath: expect.any(String),
            metadata: expect.objectContaining({
              typeName: "MissingResponse",
              suggestedFix: expect.any(String),
            }),
          }),
          expect.objectContaining({
            code: "unknown-zod-helper",
            filePath: expect.stringContaining(path.join("unknown-zod", "route.ts")),
            metadata: expect.objectContaining({
              name: "mystery",
            }),
          }),
        ]),
      );
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });
});
