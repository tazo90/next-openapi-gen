import fs from "fs-extra";
import path from "path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RouteProcessor } from "@next-openapi-gen/routes/route-processor.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";

describe("Ignore routes integration", () => {
  const testDir = path.join(process.cwd(), "tests", "fixtures", "app", "api");

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

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
            return { info: "public" };
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
    const appDir = path.join(process.cwd(), "tests", "fixtures", "app");
    if (fs.existsSync(appDir)) {
      await fs.remove(appDir);
    }
  });

  const baseConfig: OpenApiConfig = {
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

  it("excludes routes with @ignore tags", () => {
    const routeProcessor = new RouteProcessor(baseConfig);
    routeProcessor.scanApiRoutes(testDir);

    expect(routeProcessor.getSwaggerPaths()).toMatchObject({
      "/users": expect.any(Object),
      "/debug": expect.any(Object),
      "/admin/test": expect.any(Object),
      "/public/info": expect.any(Object),
    });
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/internal");
  });

  it("applies exact and wildcard ignore patterns", () => {
    const routeProcessor = new RouteProcessor({
      ...baseConfig,
      ignoreRoutes: ["/debug", "/admin/*"],
    });
    routeProcessor.scanApiRoutes(testDir);

    expect(routeProcessor.getSwaggerPaths()).toHaveProperty("/users");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/debug");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/admin/test");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/internal");
  });

  it("combines includeOpenApiRoutes with ignoreRoutes", () => {
    const routeProcessor = new RouteProcessor({
      ...baseConfig,
      includeOpenApiRoutes: true,
      ignoreRoutes: ["/public/info"],
    });
    routeProcessor.scanApiRoutes(testDir);

    expect(routeProcessor.getSwaggerPaths()).toHaveProperty("/users");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/public/info");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/debug");
    expect(routeProcessor.getSwaggerPaths()).not.toHaveProperty("/admin/test");
  });
});
