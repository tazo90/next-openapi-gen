import { beforeEach, describe, expect, it, vi } from "vitest";

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

  describe("orchestration helpers", () => {
    it("delegates response processing to the shared response processor", () => {
      routeProcessor = new RouteProcessor(baseConfig);

      expect(
        // @ts-expect-error exercising private helper in focused unit test
        routeProcessor.processResponsesFromConfig({ responseType: "User" }, "GET"),
      ).toEqual({
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
      });
    });

    it("skips non-openapi routes when includeOpenApiRoutes is enabled", () => {
      routeProcessor = new RouteProcessor({
        ...baseConfig,
        includeOpenApiRoutes: true,
      });

      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.registerRoute("GET", "./src/app/api/users/route.ts", "/users", {
        summary: "Hidden route",
      });

      expect(routeProcessor.getPaths()).toEqual({});
    });

    it("sorts paths by tag name and then by path depth", () => {
      routeProcessor = new RouteProcessor(baseConfig);

      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.addRouteToPaths("GET", "/users", { tag: "Users" }, []);
      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.addRouteToPaths("GET", "/users/settings", { tag: "Users" }, []);
      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.addRouteToPaths("GET", "/admin", { tag: "Admin" }, []);

      expect(Object.keys(routeProcessor.getPaths())).toEqual([
        "/admin",
        "/users",
        "/users/settings",
      ]);
    });

    it("only scans existing source roots", () => {
      routeProcessor = new RouteProcessor(baseConfig);
      const scanApiRoutesSpy = vi
        .spyOn(routeProcessor, "scanApiRoutes")
        .mockImplementation(() => {});
      // @ts-expect-error overriding source in focused unit test
      routeProcessor.source = {
        getScanRoots: () => ["./missing-root", "."],
      };

      routeProcessor.scanRoutes();

      expect(scanApiRoutesSpy).toHaveBeenCalledTimes(1);
      expect(scanApiRoutesSpy).toHaveBeenCalledWith(".");
    });
  });
});
