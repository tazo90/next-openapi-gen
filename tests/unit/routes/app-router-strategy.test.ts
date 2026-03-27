import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRouterStrategy } from "@next-openapi-gen/routes/app-router-strategy.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";

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

  it("infers response schemas from typed NextResponse return annotations", () => {
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
        inferredResponses: [
          expect.objectContaining({
            contentType: "application/json",
          }),
        ],
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
});
