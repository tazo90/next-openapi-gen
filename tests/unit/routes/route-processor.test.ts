import { beforeEach, describe, expect, it } from "vitest";

import { RouteProcessor } from "@next-openapi-gen/routes/route-processor.js";
import type { DataTypes, OpenApiConfig } from "@next-openapi-gen/shared/types.js";

describe("RouteProcessor", () => {
  let routeProcessor: RouteProcessor;
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

  describe("shouldIgnoreRoute", () => {
    it("ignores routes marked with @ignore", () => {
      routeProcessor = new RouteProcessor(baseConfig);

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users", { isIgnored: true })).toBe(true);
    });

    it("matches exact and wildcard ignore patterns", () => {
      routeProcessor = new RouteProcessor({
        ...baseConfig,
        ignoreRoutes: ["/api/internal", "/api/private/*", "/admin/*/temp"],
      });

      const dataTypes: DataTypes = {};

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/internal", dataTypes)).toBe(true);
      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/private/debug", dataTypes)).toBe(true);
      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/admin/users/temp", dataTypes)).toBe(true);
      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users", dataTypes)).toBe(false);
    });

    it("returns false when ignoreRoutes are omitted", () => {
      routeProcessor = new RouteProcessor(baseConfig);

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users", {})).toBe(false);
    });

    it("handles path parameters in patterns", () => {
      routeProcessor = new RouteProcessor({
        ...baseConfig,
        ignoreRoutes: ["/api/users/{id}/internal", "/api/*/internal/*"],
      });

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users/{id}/internal", {})).toBe(true);
      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/posts/internal/test", {})).toBe(true);
    });
  });
});
