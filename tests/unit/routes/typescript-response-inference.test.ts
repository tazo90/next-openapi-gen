import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  inferResponsesForExport,
  inferResponsesForExports,
} from "@workspace/openapi-core/routes/typescript-response-inference.js";
import * as typescriptProject from "@workspace/openapi-core/shared/typescript-project.js";
import { clearTypeScriptProjectCache } from "@workspace/openapi-core/shared/typescript-project.js";
import {
  clearTypeScriptRuntimeCache,
  TypeScriptUnavailableError,
} from "@workspace/openapi-core/shared/typescript-runtime.js";

describe("TypeScript response inference", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    clearTypeScriptProjectCache();
    clearTypeScriptRuntimeCache();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("returns an empty map when TypeScript is unavailable", () => {
    vi.spyOn(typescriptProject, "getTypeScriptAdapter").mockImplementation(() => {
      throw new TypeScriptUnavailableError({
        packagePath: "/virtual/typescript",
        support: "too-old",
        version: "4.9.5",
        ts: undefined,
      });
    });

    expect(inferResponsesForExports("/virtual/route.ts", ["GET"]).size).toBe(0);
    expect(inferResponsesForExport("/virtual/route.ts", "GET")).toEqual({
      responses: [],
      diagnostics: [],
    });
  });

  it("covers leftover unexpected errors, redirects, empty handlers, and cache reuse", () => {
    vi.spyOn(typescriptProject, "getTypeScriptAdapter").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => inferResponsesForExports("/virtual/route.ts", ["GET"])).toThrow("boom");
    vi.restoreAllMocks();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-leftover-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
export function GET() {
  return Response.redirect("/next", 308);
}

export function POST() {}

export const PATCH = () => new Response(null, { status: 204 });
`,
    );

    expect(inferResponsesForExport(routeFile, "GET").responses).toEqual(
      expect.arrayContaining([expect.objectContaining({ statusCode: "308" })]),
    );
    expect(inferResponsesForExport(routeFile, "POST").responses).toEqual([]);
    expect(inferResponsesForExports(routeFile, ["GET", "POST", "MISSING"]).get("GET")).toEqual(
      inferResponsesForExport(routeFile, "GET"),
    );
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

  it("infers NextResponse, array payloads, and Date fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-next-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `type Item = { id: string; createdAt: Date };

export async function GET() {
  return NextResponse.json([{ id: "1", createdAt: new Date() }] satisfies Item[]);
}

export async function POST() {
  return NextResponse.json({ id: "1", createdAt: new Date() } satisfies Item, { status: 201 });
}
`,
    );

    const getResult = inferResponsesForExport(routeFile, "GET");
    const postResult = inferResponsesForExport(routeFile, "POST");

    expect(getResult.responses[0]).toMatchObject({
      contentType: "application/json",
      source: "typescript",
    });
    expect(postResult.responses[0]).toMatchObject({
      statusCode: "201",
      source: "typescript",
    });
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

  it("covers signature inference, unresolved returns, and inline schema branches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-response-branches-"));
    roots.push(root);

    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
type User = { id: string };
type Item = { name: string };
interface Wrapper<T> { data: T }

export async function typed(): Promise<Wrapper<User>> {
  throw new Error("no return");
}

export const expression = async function () {
  return Response.json({ ok: true as const, count: 1 as const, flag: false as const });
};

export async function GET() {
  if (Date.now() > 0) {
    return NextResponse.redirect("https://example.com");
  }
  return Response.redirect("https://example.com", { status: 308 });
}

export async function POST() {
  const payload = { id: "1" };
  return payload;
}

export async function PUT() {
  const payload: {
    name: string;
    nickname: string | null;
    tags: [string, string];
    extras: Record<string, number>;
    optional?: string;
  } = {
    name: "Ada",
    nickname: null,
    tags: ["a", "b"],
    extras: { count: 1 },
  };
  return Response.json(payload);
}

export async function PATCH() {
  return Response.json({ kind: \`user-\${"1"}\` });
}

export async function DELETE() {
  return Response.json({ id: "1" });
  return Response.json({ id: "1" });
}

function hidden() {
  return Response.json({ hidden: true });
}
`,
    );

    expect(inferResponsesForExport(routeFile, "typed").responses).toEqual([
      expect.objectContaining({ typeName: "User", source: "typescript" }),
    ]);
    expect(inferResponsesForExport(routeFile, "expression").responses[0]).toMatchObject({
      contentType: "application/json",
      source: "typescript",
    });
    expect(inferResponsesForExport(routeFile, "GET").responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ statusCode: "302", source: "typescript" }),
        expect.objectContaining({ statusCode: "308", source: "typescript" }),
      ]),
    );
    expect(inferResponsesForExport(routeFile, "POST").diagnostics[0]?.code).toBe(
      "response-inference-unresolved",
    );
    const putSchema = inferResponsesForExport(routeFile, "PUT").responses[0]?.schema as {
      properties?: Record<string, unknown>;
    };
    expect(putSchema?.properties).toMatchObject({
      name: { type: "string" },
      nickname: expect.objectContaining({ nullable: true }),
    });
    expect(inferResponsesForExport(routeFile, "PATCH").responses[0]?.schema).toMatchObject({
      type: "object",
    });
    expect(inferResponsesForExport(routeFile, "DELETE").responses).toHaveLength(1);
    expect(inferResponsesForExport(routeFile, "hidden").responses).toEqual([]);
    expect(inferResponsesForExports(routeFile, ["missing"]).size).toBe(0);
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
  close() {}
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
