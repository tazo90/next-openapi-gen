import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RouteProcessor } from "../src/lib/route-processor.js";
import { OpenApiConfig } from "../src/types.js";
import fs from "fs-extra";
import path from "path";

describe("Ignore Routes - Integration Tests", () => {
  const testDir = path.join(process.cwd(), "tests", "fixtures", "app", "api");

  beforeAll(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test route files
    const routes = [
      {
        path: path.join(testDir, "users", "route.ts"),
        content: `
          /**
           * Get all users
           * @openapi
           */
          export async function GET() {
            return { users: [] };
          }
        `,
      },
      {
        path: path.join(testDir, "internal", "route.ts"),
        content: `
          /**
           * Internal route - should be ignored
           * @ignore
           */
          export async function GET() {
            return { internal: true };
          }
        `,
      },
      {
        path: path.join(testDir, "debug", "route.ts"),
        content: `
          /**
           * Debug route
           */
          export async function GET() {
            return { debug: true };
          }
        `,
      },
      {
        path: path.join(testDir, "admin", "test", "route.ts"),
        content: `
          /**
           * Admin test route
           */
          export async function POST() {
            return { test: true };
          }
        `,
      },
      {
        path: path.join(testDir, "public", "info", "route.ts"),
        content: `
          /**
           * Public info route
           * @openapi
           */
          export async function GET() {
            return { info: 'public' };
          }
        `,
      },
    ];

    routes.forEach((route) => {
      const dir = path.dirname(route.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(route.path, route.content);
    });
  });

  afterAll(async () => {
    // Cleanup only the test directory we created (app/api within fixtures)
    const appDir = path.join(process.cwd(), "tests", "fixtures", "app");
    if (fs.existsSync(appDir)) {
      await fs.remove(appDir);
    }
  });

  it("should exclude routes with @ignore tag", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should include users and debug routes, but not internal (has @ignore)
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/debug");
    expect(paths).toHaveProperty("/admin/test");
    expect(paths).toHaveProperty("/public/info");
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should exclude routes matching ignoreRoutes patterns", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: ["/debug", "/admin/test"],
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should include users and public/info, but not debug or admin/test
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/public/info");
    expect(paths).not.toHaveProperty("/debug");
    expect(paths).not.toHaveProperty("/admin/test");
    // Internal should still be excluded due to @ignore tag
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should exclude routes matching wildcard patterns", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: ["/admin/*", "/internal/*"],
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should include users, debug, and public/info
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/debug");
    expect(paths).toHaveProperty("/public/info");
    // Should not include admin/test (matches /admin/* pattern)
    expect(paths).not.toHaveProperty("/admin/test");
    // Internal should be excluded (both by pattern and @ignore tag)
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should handle combination of @ignore tag and patterns", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: ["/debug"],
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should only include users, admin/test, and public/info
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/admin/test");
    expect(paths).toHaveProperty("/public/info");
    // Debug excluded by pattern
    expect(paths).not.toHaveProperty("/debug");
    // Internal excluded by @ignore tag
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should work with includeOpenApiRoutes and ignore routes", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: true, // Only include routes with @openapi
      ignoreRoutes: ["/public/info"],
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should only include /users (has @openapi and not ignored)
    expect(paths).toHaveProperty("/users");
    // public/info has @openapi but is in ignoreRoutes
    expect(paths).not.toHaveProperty("/public/info");
    // Others don't have @openapi tag
    expect(paths).not.toHaveProperty("/debug");
    expect(paths).not.toHaveProperty("/admin/test");
    // Internal has @ignore tag
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should handle empty ignoreRoutes array", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      ignoreRoutes: [],
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should include all routes except those with @ignore tag
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/debug");
    expect(paths).toHaveProperty("/admin/test");
    expect(paths).toHaveProperty("/public/info");
    // Only internal should be excluded (has @ignore tag)
    expect(paths).not.toHaveProperty("/internal");
  });

  it("should handle no ignoreRoutes config", () => {
    const config: OpenApiConfig = {
      apiDir: testDir,
      schemaDir: "./src/types",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config);
    routeProcessor.scanApiRoutes(testDir);
    const paths = routeProcessor.getSwaggerPaths();

    // Should include all routes except those with @ignore tag
    expect(paths).toHaveProperty("/users");
    expect(paths).toHaveProperty("/debug");
    expect(paths).toHaveProperty("/admin/test");
    expect(paths).toHaveProperty("/public/info");
    // Only internal should be excluded (has @ignore tag)
    expect(paths).not.toHaveProperty("/internal");
  });
});
