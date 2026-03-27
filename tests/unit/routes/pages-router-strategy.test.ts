import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PagesRouterStrategy } from "@next-openapi-gen/routes/pages-router-strategy.js";
import { RouteProcessor } from "@next-openapi-gen/routes/route-processor.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";

describe("PagesRouterStrategy", () => {
  let strategy: PagesRouterStrategy;
  let pagesConfig: OpenApiConfig;
  const roots: string[] = [];

  beforeEach(() => {
    pagesConfig = {
      apiDir: "./pages/api",
      routerType: "pages",
      schemaDir: "./schemas",
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

  describe("getRoutePath", () => {
    it("maps pages router file paths to OpenAPI paths", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      expect(strategy.getRoutePath("./pages/api/users/index.ts")).toBe("/users");
      expect(strategy.getRoutePath("./pages/api/users.ts")).toBe("/users");
      expect(strategy.getRoutePath("./pages/api/users/[id].ts")).toBe("/users/{id}");
      expect(strategy.getRoutePath("./pages/api/[...slug].ts")).toBe("/{slug}");
      expect(strategy.getRoutePath(".\\pages\\api\\users\\[id].ts")).toBe("/users/{id}");
      expect(strategy.getRoutePath("./pages/api/index.ts")).toBe("/");
    });
  });

  describe("extractJSDocFromComment", () => {
    it("extracts method, summary, description, response type, and @openapi", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const result = strategy.extractJSDocFromComment(`
        * Get all users
        * @description Retrieve a list of all users
        * @method GET
        * @response UserSchema[]
        * @openapi
      `);

      expect(result.method).toBe("GET");
      expect(result.summary).toBe("Get all users");
      expect(result.description).toBe("Retrieve a list of all users");
      expect(result.responseType).toBe("UserSchema[]");
      expect(result.isOpenApi).toBe(true);
    });

    it("extracts params, auth, operationId, and add responses", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const result = strategy.extractJSDocFromComment(`
        * Get user by ID
        * @method GET
        * @pathParams UserIdSchema
        * @params UserQuerySchema
        * @auth bearer,CustomType
        * @operationId getUserById
        * @add 401:ErrorResponse
        * @add 500:ErrorResponse
      `);

      expect(result.pathParamsType).toBe("UserIdSchema");
      expect(result.paramsType).toBe("UserQuerySchema");
      expect(result.auth).toBe("BearerAuth,CustomType");
      expect(result.operationId).toBe("getUserById");
      expect(result.addResponses).toBe("401:ErrorResponse,500:ErrorResponse");
    });

    it("extracts boolean flags like @deprecated and @ignore", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const result = strategy.extractJSDocFromComment(`
        * Old endpoint
        * @method GET
        * @deprecated
        * @ignore
      `);

      expect(result.deprecated).toBe(true);
      expect(result.isIgnored).toBe(true);
    });

    it("extracts response sets, body metadata, and auth presets", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const result = strategy.extractJSDocFromComment(`
        * Upload avatar
        * @method POST
        * @body UploadAvatarBody
        * @bodyDescription Avatar form data
        * @contentType multipart/form-data
        * @responseSet errors
        * @auth apikey
      `);

      expect(result.bodyType).toBe("UploadAvatarBody");
      expect(result.bodyDescription).toBe("Avatar form data");
      expect(result.contentType).toBe("multipart/form-data");
      expect(result.responseSet).toBe("errors");
      expect(result.auth).toBe("ApiKeyAuth");
    });
  });

  describe("RouteProcessor interop", () => {
    it("uses the pages router strategy when routerType is pages", () => {
      const routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.addRouteToPaths("GET", "./pages/api/users/index.ts", {
        summary: "Get users",
        description: "Get all users",
      });

      const paths = routeProcessor.getSwaggerPaths();
      expect(paths["/users"]).toBeDefined();
      expect(paths["/users"]?.get).toBeDefined();
    });
  });

  it("filters processable files and extracts default export handler comments", () => {
    strategy = new PagesRouterStrategy(pagesConfig);

    expect(strategy.shouldProcessFile("users.ts")).toBe(true);
    expect(strategy.shouldProcessFile("users.tsx")).toBe(true);
    expect(strategy.shouldProcessFile("_middleware.ts")).toBe(false);
    expect(strategy.shouldProcessFile("users.js")).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pages-router-"));
    roots.push(root);
    const filePath = path.join(root, "users.ts");
    fs.writeFileSync(
      filePath,
      `
      /**
       * List users
       * @method GET
       * @openapi
       */
      export default async function handler() {}
      `,
    );

    const addRoute = vi.fn();
    strategy.processFile(filePath, addRoute);

    expect(addRoute).toHaveBeenCalledWith(
      "GET",
      filePath,
      expect.objectContaining({
        summary: "List users",
        isOpenApi: true,
      }),
    );
  });
});
