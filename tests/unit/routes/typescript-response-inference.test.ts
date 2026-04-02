import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  inferResponsesForExport,
  inferResponsesForExports,
} from "@workspace/openapi-core/routes/typescript-response-inference.js";

describe("TypeScript response inference", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("collects multiple typed return branches with status codes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-inference-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `type SuccessResponse = {
  id: number;
};

type ErrorResponse = {
  error: string;
};

export async function GET(flag: boolean) {
  if (flag) {
    return Response.json({ id: 1 } satisfies SuccessResponse);
  }

  return Response.json({ error: "missing" } satisfies ErrorResponse, { status: 404 });
}
`,
    );

    const result = inferResponsesForExport(routeFile, "GET");

    expect(result.diagnostics).toEqual([]);
    expect(result.responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statusCode: "200",
          contentType: "application/json",
          source: "typescript",
          schema: {
            type: "object",
            properties: {
              id: {
                type: "number",
              },
            },
            required: ["id"],
          },
        }),
        expect.objectContaining({
          statusCode: "404",
          contentType: "application/json",
          source: "typescript",
          schema: {
            type: "object",
            properties: {
              error: {
                type: "string",
              },
            },
            required: ["error"],
          },
        }),
      ]),
    );
  });

  it("falls back to inline schemas and 204 responses when no named type is available", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-inline-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function POST() {
  if (Date.now() > 0) {
    return Response.json({ ok: true, total: 2 });
  }

  return new Response(null, { status: 204 });
}
`,
    );

    const result = inferResponsesForExport(routeFile, "POST");

    expect(result.responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: "application/json",
          source: "typescript",
          schema: {
            type: "object",
            properties: {
              ok: {
                type: "boolean",
              },
              total: {
                type: "number",
              },
            },
            required: ["ok", "total"],
          },
        }),
        expect.objectContaining({
          statusCode: "204",
          source: "typescript",
        }),
      ]),
    );
  });

  it("returns empty results when the route file is missing from the TypeScript program", () => {
    const result = inferResponsesForExport(
      path.join(os.tmpdir(), "nxog-response-missing", "missing-route.ts"),
      "GET",
    );

    expect(result.responses).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("infers variable exports that use arrow function handlers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-const-export-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export const GET = async () => {
  return Response.json({ ok: true });
};
`,
    );

    const result = inferResponsesForExport(routeFile, "GET");

    expect(result.diagnostics).toEqual([]);
    expect(result.responses).toEqual([
      expect.objectContaining({
        statusCode: "200",
        contentType: "application/json",
        source: "typescript",
      }),
    ]);
  });

  it("reuses cached inference when inferResponsesForExports is called repeatedly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-cache-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function GET() {
  return Response.json({ cached: true });
}
`,
    );

    const first = inferResponsesForExports(routeFile, ["GET"]);
    const second = inferResponsesForExports(routeFile, ["GET"]);

    expect(first.get("GET")?.responses).toEqual(second.get("GET")?.responses);
  });

  it("infers redirect status codes from Response.redirect calls", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-redirect-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function GET() {
  return Response.redirect("https://example.com/export.csv", 307);
}
`,
    );

    const result = inferResponsesForExport(routeFile, "GET");

    expect(result.responses).toEqual([
      {
        statusCode: "307",
        source: "typescript",
      },
    ]);
  });
});
