import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRouterStrategy } from "@workspace/openapi-framework-next/routes/app-router-strategy.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import type { OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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

    const addRoute = vi.fn();
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
