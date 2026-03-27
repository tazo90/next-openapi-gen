import { beforeEach, describe, expect, it } from "vitest";

import { AppRouterStrategy } from "@next-openapi-gen/routes/app-router-strategy.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";

describe("AppRouterStrategy", () => {
  let strategy: AppRouterStrategy;
  let baseConfig: OpenApiConfig;

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
});
