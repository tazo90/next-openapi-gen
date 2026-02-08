import { describe, it, expect, beforeEach } from "vitest";
import { AppRouterStrategy } from "../src/lib/app-router-strategy.js";
import { OpenApiConfig } from "../src/types.js";

describe("AppRouterStrategy - getRoutePath", () => {
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

  it('should handle default apiDir "./src/app/api"', () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/api",
    });
    expect(strategy.getRoutePath("./src/app/api/users/route.ts")).toBe(
      "/users",
    );
  });

  it('should handle custom apiDir "./src/app/private"', () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(strategy.getRoutePath("./src/app/private/users/route.ts")).toBe(
      "/users",
    );
  });

  it("should handle apiDir with trailing slash", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/api/",
    });
    expect(strategy.getRoutePath("./src/app/api/users/route.ts")).toBe(
      "/users",
    );
  });

  it('should handle apiDir without leading "./"', () => {
    strategy = new AppRouterStrategy({ ...baseConfig, apiDir: "src/app/api" });
    expect(strategy.getRoutePath("src/app/api/users/route.ts")).toBe("/users");
  });

  it("should handle nested routes with custom apiDir", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(
      strategy.getRoutePath("./src/app/private/users/profile/route.ts"),
    ).toBe("/users/profile");
  });

  it("should handle Windows path separators", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: ".\\src\\app\\api",
    });
    expect(strategy.getRoutePath(".\\src\\app\\api\\users\\route.ts")).toBe(
      "/users",
    );
  });

  it("should handle dynamic routes with custom apiDir", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(strategy.getRoutePath("./src/app/private/users/[id]/route.ts")).toBe(
      "/users/{id}",
    );
  });

  it("should handle route groups with custom apiDir", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(
      strategy.getRoutePath("./src/app/private/(authenticated)/users/route.ts"),
    ).toBe("/users");
  });

  it("should handle catch-all routes with custom apiDir", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(
      strategy.getRoutePath("./src/app/private/files/[...path]/route.ts"),
    ).toBe("/files/{path}");
  });

  it("should handle root route with custom apiDir", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(strategy.getRoutePath("./src/app/private/route.ts")).toBe("/");
  });

  it("should throw error when apiDir is not found in file path", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/api",
    });
    expect(() =>
      strategy.getRoutePath("./src/app/private/users/route.ts"),
    ).toThrow(
      'Could not find apiDir "./src/app/api" in file path "./src/app/private/users/route.ts"',
    );
  });

  it("should handle apiDir that appears multiple times in path (use first occurrence)", () => {
    strategy = new AppRouterStrategy({ ...baseConfig, apiDir: "./src/api" });
    expect(strategy.getRoutePath("./src/api/api-users/route.ts")).toBe(
      "/api-users",
    );
  });

  it("should handle .tsx route files", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(strategy.getRoutePath("./src/app/private/users/route.tsx")).toBe(
      "/users",
    );
  });

  it("should handle mixed forward and backward slashes", () => {
    strategy = new AppRouterStrategy({
      ...baseConfig,
      apiDir: "./src/app/private",
    });
    expect(strategy.getRoutePath("./src\\app\\private/users/route.ts")).toBe(
      "/users",
    );
  });
});
