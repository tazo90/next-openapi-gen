import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRouterStrategy } from "@workspace/openapi-framework-next/routes/app-router-strategy.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import type { OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

type AddRoute = Parameters<AppRouterStrategy["processFile"]>[1];

describe("AppRouterStrategy", () => {
  let strategy: AppRouterStrategy;
  let baseConfig: OpenApiConfig;
  const roots: string[] = [];

  beforeEach(() => {
    baseConfig = {
      apiDir: "./src/app/api",
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      schemaType: "typescript",
      debug: false,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("handles default, nested, dynamic, grouped, and catch-all routes", () => {
    strategy = new AppRouterStrategy(baseConfig);

    expect(strategy.getRoutePath("./src/app/api/users/route.ts")).toBe("/users");
    expect(strategy.getRoutePath("./src/app/api/users/profile/route.ts")).toBe("/users/profile");
    expect(strategy.getRoutePath("./src/app/api/users/[id]/route.ts")).toBe("/users/{id}");
    expect(strategy.getRoutePath("./src/app/api/(authenticated)/users/route.ts")).toBe("/users");
    expect(strategy.getRoutePath("./src/app/api/files/[...path]/route.ts")).toBe("/files/{path}");
  });

  it("supports custom apiDir values and windows-style paths", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: ".\\src\\app\\private",
    });

    expect(strategy.getRoutePath(".\\src\\app\\private\\users\\route.ts")).toBe("/users");
    expect(strategy.getRoutePath("./src\\app\\private/users/[id]/route.ts")).toBe("/users/{id}");
  });

  it("returns / for the api root route", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });

    expect(strategy.getRoutePath("./src/app/private/route.ts")).toBe("/");
  });

  it("throws when the configured apiDir is not present in the file path", () => {
    strategy = new AppRouterStrategy(baseConfig);

    expect(() => strategy.getRoutePath("./src/app/private/users/route.ts")).toThrow(
      'Could not find apiDir "./src/app/api" in file path "./src/app/private/users/route.ts"',
    );
  });

  it("precheckFile requires @openapi when includeOpenApiRoutes is enabled", () => {
    strategy = new AppRouterStrategy({ ...baseConfig, includeOpenApiRoutes: true });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-precheck-openapi-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `export async function GET() { return Response.json({ ok: true }); }`,
    );

    expect(strategy.precheckFile(routeFile)).toBe(false);
  });

  it("precheckFile rejects files without exported HTTP handlers", () => {
    strategy = new AppRouterStrategy(baseConfig);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-precheck-handlers-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(routeFile, `export async function loader() {}`);

    expect(strategy.precheckFile(routeFile)).toBe(false);
  });

  it("reuses readFile cache across repeated precheckFile calls", () => {
    strategy = new AppRouterStrategy(baseConfig);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-readfile-cache-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      /**
       * Ping
       * @openapi
       */
      export async function GET() {}
      `,
    );

    expect(strategy.precheckFile(routeFile)).toBe(true);
    expect(strategy.precheckFile(routeFile)).toBe(true);
  });

  it("recognizes only App Router route files and extracts exported handlers", () => {
    strategy = new AppRouterStrategy(baseConfig);

    expect(strategy.shouldProcessFile("route.ts")).toBe(true);
    expect(strategy.shouldProcessFile("route.tsx")).toBe(true);
    expect(strategy.shouldProcessFile("page.tsx")).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      /**
       * Fetch a user
       * @openapi
       */
      export async function GET() {}

      /** 
       * Update a user
       * @openapi
       */
      export const PATCH = async () => {};

      export const ignored = async () => {};
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "GET",
      routeFile,
      expect.objectContaining({
        summary: "Fetch a user",
        isOpenApi: true,
      }),
    );
    expect(addRoute).toHaveBeenCalledWith(
      "PATCH",
      routeFile,
      expect.objectContaining({
        summary: "Update a user",
        isOpenApi: true,
      }),
    );
    expect(addRoute).toHaveBeenCalledTimes(2);
  });

  it("uses typed NextResponse return annotations without checker fallback when no special response inference is needed", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-infer-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { NextRequest, NextResponse } from "next/server";

      type PostResponse = {
        id: number;
        title: string;
      };

      /**
       * Get post by ID
       * @openapi
       */
      export async function GET(
        request: NextRequest
      ): Promise<NextResponse<PostResponse>> {
        return NextResponse.json({ id: 1, title: "Hello" });
      }
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "GET",
      routeFile,
      expect.objectContaining({
        isOpenApi: true,
        responseType: "PostResponse",
      }),
    );
  });

  it("keeps checker inference for response helpers that need status-aware analysis", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-status-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { NextResponse } from "next/server";

      type PostResponse = {
        id: number;
      };

      /**
       * Create post
       * @openapi
       */
      export async function POST(): Promise<NextResponse<PostResponse>> {
        return NextResponse.json({ id: 1 }, { status: 201 });
      }
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "POST",
      routeFile,
      expect.objectContaining({
        isOpenApi: true,
        inferredResponses: [
          expect.objectContaining({
            statusCode: "201",
            contentType: "application/json",
          }),
        ],
      }),
    );
  });

  it("detects status fields on response option objects, including string-literal keys", () => {
    strategy = new AppRouterStrategy(baseConfig);
    const optsAst = parseTypeScriptFile(`const opts = { "status": 418 };`);
    const decl = optsAst.program.body[0];
    if (!decl || decl.type !== "VariableDeclaration") {
      throw new Error("Expected variable declaration");
    }
    const init = decl.declarations[0]?.init;
    if (!init || init.type !== "ObjectExpression") {
      throw new Error("Expected object expression");
    }
    const statusProp = init.properties[0];
    if (!statusProp || statusProp.type !== "ObjectProperty") {
      throw new Error("Expected object property");
    }
    // @ts-expect-error exercising private helper for string-literal property keys
    expect(strategy.isPropertyNamed(statusProp, "status")).toBe(true);
    // @ts-expect-error exercising private helper for literal status extraction
    expect(strategy.getLiteralResponseStatusCode(init)).toBe("418");
  });

  it("infers JSON body shapes for checker-backed response analysis", () => {
    strategy = new AppRouterStrategy(baseConfig);

    // @ts-expect-error exercising inferSchemaFromJsonArgument branches
    expect(strategy.inferSchemaFromJsonArgument(undefined)).toEqual({ type: "object" });
    // @ts-expect-error
    expect(strategy.inferSchemaFromJsonArgument(t.nullLiteral())).toEqual({ type: "null" });
    // @ts-expect-error
    expect(
      strategy.inferSchemaFromJsonArgument(t.spreadElement(t.identifier("rest"))),
    ).toBeUndefined();
    // @ts-expect-error
    expect(strategy.inferSchemaFromJsonArgument(t.identifier("data"))).toEqual({ type: "object" });
    // @ts-expect-error
    expect(
      strategy.inferSchemaFromJsonArgument(
        t.arrayExpression([t.spreadElement(t.identifier("items")), t.numericLiteral(1)]),
      ),
    ).toEqual({ type: "array", items: { type: "number" } });
  });

  it("infers query parameters read from URL searchParams", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-query-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      /**
       * Update comment
       * @openapi
       */
      export async function PATCH(request: Request) {
        const url = new URL(request.url);
        const commentId = url.searchParams.get("commentId");

        return Response.json({ commentId });
      }
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "PATCH",
      routeFile,
      expect.objectContaining({
        inferredQueryParamNames: ["commentId"],
      }),
    );
  });

  it("keeps explicit @response annotations authoritative over inferred responses", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-explicit-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      type PostResponse = {
        id: number;
      };

      /**
       * Get post by ID
       * @openapi
       * @response ExplicitResponse
       */
      export async function GET(): Promise<Response> {
        return Response.json({ id: 1 } satisfies PostResponse);
      }
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "GET",
      routeFile,
      expect.objectContaining({
        responseType: "ExplicitResponse",
      }),
    );
  });

  it("extracts annotated response types from handler signatures", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const ast = parseTypeScriptFile(`
      namespace Models {
        export type Post = {
          id: number;
        };
      }

      export async function GET(): Promise<NextResponse<Models.Post[]>> {
        return NextResponse.json([]);
      }
    `);
    const declaration = ast.program.body.find((node) =>
      t.isExportNamedDeclaration(node),
    )?.declaration;

    expect(declaration).toBeDefined();
    // @ts-expect-error exercising a focused private helper for annotation coverage
    expect(strategy.inferResponseTypeFromHandler(declaration)).toBe("Post[]");
  });

  it("returns an empty response type for unsupported annotations or handler nodes", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const typedAst = parseTypeScriptFile(`
      export const GET = async (): Promise<NextResponse<string>> => {
        return NextResponse.json("ok");
      };
    `);
    const typedDeclaration = typedAst.program.body.find((node) =>
      t.isExportNamedDeclaration(node),
    )?.declaration;

    expect(typedDeclaration).toBeDefined();
    if (!typedDeclaration || !t.isVariableDeclaration(typedDeclaration)) {
      throw new Error("Expected a variable declaration");
    }

    // @ts-expect-error exercising a focused private helper for unsupported type coverage
    expect(strategy.inferResponseTypeFromHandler(typedDeclaration.declarations[0])).toBe("");
    // @ts-expect-error exercising the non-function fallback path
    expect(strategy.inferResponseTypeFromHandler(t.identifier("GET"))).toBe("");
  });

  it("adds inferred response types when the checker does not provide one", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-generic-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { NextResponse } from "next/server";

      type ApiEnvelope<T> = {
        data: T;
      };

      type Post = {
        id: number;
      };

      /**
       * Get wrapped post
       * @openapi
       */
      export async function GET(): Promise<NextResponse<ApiEnvelope<Post>>> {
        return NextResponse.json({ data: { id: 1 } });
      }
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "GET",
      routeFile,
      expect.objectContaining({
        responseType: "ApiEnvelope<Post>",
      }),
    );
  });

  it("returns an empty response type for non-reference return annotations", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const ast = parseTypeScriptFile(`
      export function GET(): string {
        return "ok";
      }
    `);
    const declaration = ast.program.body.find((node) =>
      t.isExportNamedDeclaration(node),
    )?.declaration;

    expect(declaration).toBeDefined();
    // @ts-expect-error exercising a focused private helper for non-reference annotations
    expect(strategy.inferResponseTypeFromHandler(declaration)).toBe("");
  });

  it("ignores exported declarations that are not HTTP handlers", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-app-router-non-handlers-"));
    roots.push(root);
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      export async function loader() {}
      export const [GET] = [async () => new Response(null)];
      `,
    );

    const addRoute = vi.fn<AddRoute>();
    strategy.processFile(routeFile, addRoute);

    expect(addRoute).not.toHaveBeenCalled();
  });

  it("returns an empty response type for unparameterized NextResponse annotations", () => {
    strategy = new AppRouterStrategy(baseConfig);

    const ast = parseTypeScriptFile(`
      export function GET(): NextResponse {
        return new NextResponse();
      }
    `);
    const declaration = ast.program.body.find((node) =>
      t.isExportNamedDeclaration(node),
    )?.declaration;

    expect(declaration).toBeDefined();
    // @ts-expect-error exercising the empty-type-parameter branch
    expect(strategy.inferResponseTypeFromHandler(declaration)).toBe("");
  });
});
