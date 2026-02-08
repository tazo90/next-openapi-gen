import { describe, it, expect, beforeEach } from "vitest";
import { RouteProcessor } from "../src/lib/route-processor.js";
import { OpenApiConfig } from "../src/types.js";

describe("RouteProcessor - Pages Router Support", () => {
  let routeProcessor: RouteProcessor;
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

  describe("getPagesRoutePath", () => {
    it("should handle pages/api/users/index.ts -> /users", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        "./pages/api/users/index.ts"
      );
      expect(result).toBe("/users");
    });

    it("should handle pages/api/users.ts -> /users", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath("./pages/api/users.ts");
      expect(result).toBe("/users");
    });

    it("should handle dynamic routes pages/api/users/[id].ts -> /users/{id}", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        "./pages/api/users/[id].ts"
      );
      expect(result).toBe("/users/{id}");
    });

    it("should handle nested dynamic routes pages/api/users/[id]/posts/[postId].ts -> /users/{id}/posts/{postId}", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        "./pages/api/users/[id]/posts/[postId].ts"
      );
      expect(result).toBe("/users/{id}/posts/{postId}");
    });

    it("should handle catch-all routes pages/api/[...slug].ts -> /{slug}", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        "./pages/api/[...slug].ts"
      );
      expect(result).toBe("/{slug}");
    });

    it("should handle Windows path separators", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        ".\\pages\\api\\users\\[id].ts"
      );
      expect(result).toBe("/users/{id}");
    });

    it("should handle root api route pages/api/index.ts -> /", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath("./pages/api/index.ts");
      expect(result).toBe("/");
    });

    it("should handle .tsx files", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.getPagesRoutePath(
        "./pages/api/users/index.tsx"
      );
      expect(result).toBe("/users");
    });
  });

  describe("extractJSDocFromComment", () => {
    it("should extract @method GET from comment", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Get all users
        * @description Retrieve a list of all users
        * @method GET
        * @response UserSchema[]
        * @openapi
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.method).toBe("GET");
      expect(result.summary).toBe("Get all users");
      expect(result.description).toBe("Retrieve a list of all users");
      expect(result.responseType).toBe("UserSchema[]");
      expect(result.isOpenApi).toBe(true);
    });

    it("should extract @method POST with body", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Create a new user
        * @description Create a new user account
        * @method POST
        * @body CreateUserSchema
        * @response 201:UserSchema
        * @openapi
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.method).toBe("POST");
      expect(result.bodyType).toBe("CreateUserSchema");
      expect(result.successCode).toBe("201");
      expect(result.responseType).toBe("UserSchema");
    });

    it("should extract @pathParams and @params", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Get user by ID
        * @method GET
        * @pathParams UserIdSchema
        * @params UserQuerySchema
        * @response UserSchema
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.pathParamsType).toBe("UserIdSchema");
      expect(result.paramsType).toBe("UserQuerySchema");
    });

    it("should extract @auth bearer", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Protected endpoint
        * @method GET
        * @auth bearer
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.auth).toBe("BearerAuth");
    });

    it("should extract @deprecated and @ignore", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Old endpoint
        * @method GET
        * @deprecated
        * @ignore
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.deprecated).toBe(true);
      expect(result.isIgnored).toBe(true);
    });

    it("should extract @tag", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Custom tagged endpoint
        * @method GET
        * @tag CustomTag
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.tag).toBe("CustomTag");
    });

    it("should extract @operationId", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Get user
        * @method GET
        * @operationId getUserById
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.operationId).toBe("getUserById");
    });

    it("should handle lowercase method", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      const comment = `
        * Get users
        * @method get
      `;

      // @ts-ignore - accessing private method for testing
      const result = routeProcessor.extractJSDocFromComment(comment);
      expect(result.method).toBe("GET");
    });
  });

  describe("addRouteToPaths with Pages Router", () => {
    it("should use getPagesRoutePath when routerType is pages", () => {
      routeProcessor = new RouteProcessor(pagesConfig);

      // @ts-ignore - accessing private method for testing
      routeProcessor.addRouteToPaths("GET", "./pages/api/users/index.ts", {
        summary: "Get users",
        description: "Get all users",
      });

      const paths = routeProcessor.getSwaggerPaths();
      expect(paths["/users"]).toBeDefined();
      expect(paths["/users"]["get"]).toBeDefined();
    });

    it("should use getRoutePath when routerType is app (default)", () => {
      const appConfig: OpenApiConfig = {
        ...pagesConfig,
        routerType: "app",
        apiDir: "./src/app/api",
      };
      routeProcessor = new RouteProcessor(appConfig);

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
