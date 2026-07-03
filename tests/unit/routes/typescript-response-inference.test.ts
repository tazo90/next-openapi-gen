import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  inferResponsesForExport,
  inferResponsesForExports,
} from "@workspace/openapi-core/routes/typescript-response-inference.js";
import { clearTypeScriptProjectCache } from "@workspace/openapi-core/shared/typescript-project.js";
import { clearTypeScriptRuntimeCache } from "@workspace/openapi-core/shared/typescript-runtime.js";

describe("TypeScript response inference", () => {
  const roots: string[] = [];

  afterEach(() => {
    clearTypeScriptProjectCache();
    clearTypeScriptRuntimeCache();
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

  it("keeps sibling primitive properties from being treated as recursive objects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-primitive-siblings-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function GET() {
  return Response.json({ firstName: "Ada", lastName: "Lovelace" });
}
`,
    );

    const result = inferResponsesForExport(routeFile, "GET");

    expect(result.diagnostics).toEqual([]);
    expect(result.responses).toEqual([
      expect.objectContaining({
        contentType: "application/json",
        source: "typescript",
        schema: {
          type: "object",
          properties: {
            firstName: {
              type: "string",
            },
            lastName: {
              type: "string",
            },
          },
          required: ["firstName", "lastName"],
        },
      }),
    ]);
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

  it("returns empty results when the native TypeScript program does not include the route file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-native-ts-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    writeMockTypeScriptNativePackage(root);
    const routeFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function GET() {
  return Response.json({ ok: true });
}
`,
    );

    const result = inferResponsesForExports(routeFile, ["GET"]);

    expect(result.size).toBe(0);
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

function writeMockTypeScriptNativePackage(root: string) {
  const packageRoot = path.join(root, "node_modules", "typescript");
  fs.mkdirSync(path.join(packageRoot, "dist", "api", "sync"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "dist", "ast"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "typescript",
      version: "7.0.1-rc",
      type: "module",
      exports: {
        "./package.json": "./package.json",
        "./unstable/sync": "./dist/api/sync/api.js",
        "./unstable/ast": "./dist/ast/index.js",
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "dist", "api", "sync", "api.js"),
    `export const ModifierFlags = { Export: 1 };
export const SymbolFlags = { Alias: 1, Function: 2, Type: 4, Value: 8, Variable: 16 };
export const TypeFlags = {};
export const ObjectFlags = {};
export class API {
  updateSnapshot() {
    const project = {
      checker: {},
      compilerOptions: {},
      configFileName: "",
      program: { getSourceFile() { return undefined; } },
    };
    return {
      dispose() {},
      getDefaultProjectForFile() { return project; },
      getProject() { return undefined; },
      getProjects() { return [project]; },
    };
  }
}
`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "dist", "ast", "index.js"),
    "export const SyntaxKind = {};\n",
  );
}
