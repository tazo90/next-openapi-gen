import { describe, it, expect, beforeEach } from "vitest";
import { RouteProcessor } from "../src/lib/route-processor.js";
import { PagesRouterStrategy } from "../src/lib/pages-router-strategy.js";
import { OpenApiConfig } from "../src/types.js";

describe("PagesRouterStrategy", () => {
  let strategy: PagesRouterStrategy;
  let pagesConfig: OpenApiConfig;

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

  describe("getRoutePath", () => {
    it("should handle pages/api/users/index.ts -> /users", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/users/index.ts")).toBe(
        "/users"
      );
    });

    it("should handle pages/api/users.ts -> /users", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/users.ts")).toBe("/users");
    });

    it("should handle dynamic routes pages/api/users/[id].ts -> /users/{id}", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/users/[id].ts")).toBe(
        "/users/{id}"
      );
    });

    it("should handle nested dynamic routes pages/api/users/[id]/posts/[postId].ts -> /users/{id}/posts/{postId}", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(
        strategy.getRoutePath("./pages/api/users/[id]/posts/[postId].ts")
      ).toBe("/users/{id}/posts/{postId}");
    });

    it("should handle catch-all routes pages/api/[...slug].ts -> /{slug}", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/[...slug].ts")).toBe(
        "/{slug}"
      );
    });

    it("should handle Windows path separators", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath(".\\pages\\api\\users\\[id].ts")).toBe(
        "/users/{id}"
      );
    });

    it("should handle root api route pages/api/index.ts -> /", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/index.ts")).toBe("/");
    });

    it("should handle .tsx files", () => {
      strategy = new PagesRouterStrategy(pagesConfig);
      expect(strategy.getRoutePath("./pages/api/users/index.tsx")).toBe(
        "/users"
      );
    });
  });

  describe("extractJSDocFromComment", () => {
    it("should extract @method GET from comment", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Get all users
        * @description Retrieve a list of all users
        * @method GET
        * @response UserSchema[]
        * @openapi
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.method).toBe("GET");
      expect(result.summary).toBe("Get all users");
      expect(result.description).toBe("Retrieve a list of all users");
      expect(result.responseType).toBe("UserSchema[]");
      expect(result.isOpenApi).toBe(true);
    });

    it("should extract @method POST with body", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Create a new user
        * @description Create a new user account
        * @method POST
        * @body CreateUserSchema
        * @response 201:UserSchema
        * @openapi
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.method).toBe("POST");
      expect(result.bodyType).toBe("CreateUserSchema");
      expect(result.successCode).toBe("201");
      expect(result.responseType).toBe("UserSchema");
    });

    it("should extract @pathParams and @params", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Get user by ID
        * @method GET
        * @pathParams UserIdSchema
        * @params UserQuerySchema
        * @response UserSchema
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.pathParamsType).toBe("UserIdSchema");
      expect(result.paramsType).toBe("UserQuerySchema");
    });

    it("should extract @auth bearer", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Protected endpoint
        * @method GET
        * @auth bearer
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.auth).toBe("BearerAuth");
    });

    it("should extract @auth custom1,custom2", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Protected endpoint
        * @method GET
        * @auth bearer,CustomType
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.auth).toBe("BearerAuth,CustomType");
    });

    it("should extract @deprecated and @ignore", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Old endpoint
        * @method GET
        * @deprecated
        * @ignore
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.deprecated).toBe(true);
      expect(result.isIgnored).toBe(true);
    });

    it("should extract @tag", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Custom tagged endpoint
        * @method GET
        * @tag CustomTag
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.tag).toBe("CustomTag");
    });

    it("should extract @operationId", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Get user
        * @method GET
        * @operationId getUserById
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.operationId).toBe("getUserById");
    });

    it("should handle lowercase method", () => {
      strategy = new PagesRouterStrategy(pagesConfig);

      const comment = `
        * Get users
        * @method get
      `;

      const result = strategy.extractJSDocFromComment(comment);
      expect(result.method).toBe("GET");
    });
  });

  describe("addRouteToPaths with Pages Router", () => {
    it("should use pages router strategy when routerType is pages", () => {
      const routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      routeProcessor.addRouteToPaths("GET", "./pages/api/users/index.ts", {
        summary: "Get users",
        description: "Get all users",
      });

      const paths = routeProcessor.getSwaggerPaths();
      expect(paths["/users"]).toBeDefined();
      expect(paths["/users"]["get"]).toBeDefined();
    });

    it("should use app router strategy when routerType is app (default)", () => {
      const appConfig: OpenApiConfig = {
        ...pagesConfig,
        routerType: "app",
        apiDir: "./src/app/api",
      };
      const routeProcessor = new RouteProcessor(appConfig);

      // @ts-ignore - accessing private method for testing
      routeProcessor.addRouteToPaths("GET", "./src/app/api/users/route.ts", {
        summary: "Get users",
        description: "Get all users",
      });

      const paths = routeProcessor.getSwaggerPaths();
      expect(paths["/users"]).toBeDefined();
      expect(paths["/users"]["get"]).toBeDefined();
    });
  });
});
