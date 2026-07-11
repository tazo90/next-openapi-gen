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

describe("response inference extensions", () => {
  it("infers redirects, notFound calls, and streaming response hints", () => {
    const project = createTempProject("nxog-response-inference-extensions-");

    try {
      writeOpenApiTemplate(project.root, {
        openapi: "3.2.0",
        schemaType: "zod",
      });
      writeAppRoute(
        project.root,
        ["redirects"],
        `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect("https://example.com");
}
`,
      );
      writeAppRoute(
        project.root,
        ["maybe-missing"],
        `import { notFound } from "next/navigation";

export async function GET() {
  notFound();
}
`,
      );
      writeAppRoute(
        project.root,
        ["stream"],
        `export async function GET() {
  return Response.json(new ReadableStream());
}
`,
      );

      const { diagnostics, spec } = withProjectCwd(project.root, () => {
        const generator = new OpenApiGenerator({ templatePath: "next.openapi.json" });
        const spec = generator.generate();
        return {
          diagnostics: generator.getDiagnostics(),
          spec,
        };
      });

      expect(spec.paths?.["/redirects"]?.get?.responses?.["307"]).toMatchObject({
        description: "Redirect response",
        headers: {
          Location: {
            schema: {
              type: "string",
              format: "uri",
            },
          },
        },
      });
      expect(spec.paths?.["/maybe-missing"]?.get?.responses?.["404"]).toMatchObject({
        description: "Not Found",
      });
      expect(spec.paths?.["/stream"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "text/event-stream": {
            schema: {
              type: "string",
            },
          },
        },
      });
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported-route-feature",
            routePath: "/maybe-missing",
            filePath: expect.stringContaining(path.join("maybe-missing", "route.ts")),
          }),
          expect.objectContaining({
            code: "stream-response-hint",
            routePath: "/stream",
            filePath: expect.stringContaining(path.join("stream", "route.ts")),
          }),
        ]),
      );
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });
});
