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

  it("recognizes only App Router route files and extracts exported handler variables", () => {
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
      "PATCH",
      routeFile,
      expect.objectContaining({
        summary: "Update a user",
        isOpenApi: true,
      }),
    );
    expect(addRoute).toHaveBeenCalledTimes(1);
  });
});
