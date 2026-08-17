import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";
import {
  createSharedGenerationRuntime,
  invalidateRuntimeFile,
} from "@workspace/openapi-core/core/runtime.js";
import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import { RouteProcessor } from "@workspace/openapi-core/routes/route-processor.js";
import type { DataTypes, Diagnostic, OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

describe("RouteProcessor", () => {
  let routeProcessor: RouteProcessor;
  let baseConfig: OpenApiConfig;
  const adapters = createDefaultGenerationAdapters();

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
      routeProcessor = new RouteProcessor(
        baseConfig,
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users", { isIgnored: true })).toBe(true);
    });

    it("matches exact and wildcard ignore patterns", () => {
      routeProcessor = new RouteProcessor(
        {
          ...baseConfig,
          ignoreRoutes: ["/api/internal", "/api/private/*", "/admin/*/temp"],
        },
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

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
      routeProcessor = new RouteProcessor(
        baseConfig,
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users", {})).toBe(false);
    });

    it("handles path parameters in patterns", () => {
      routeProcessor = new RouteProcessor(
        {
          ...baseConfig,
          ignoreRoutes: ["/api/users/{id}/internal", "/api/*/internal/*"],
        },
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/users/{id}/internal", {})).toBe(true);
      // @ts-expect-error exercising private method in focused unit test
      expect(routeProcessor.shouldIgnoreRoute("/api/posts/internal/test", {})).toBe(true);
    });
  });

  describe("orchestration helpers", () => {
    it("delegates response processing to the shared response processor", () => {
      routeProcessor = new RouteProcessor(
        baseConfig,
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

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
      routeProcessor = new RouteProcessor(
        {
          ...baseConfig,
          includeOpenApiRoutes: true,
        },
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

      // @ts-expect-error exercising private integration point in focused unit test
      routeProcessor.registerRoute("GET", "./src/app/api/users/route.ts", "/users", {
        summary: "Hidden route",
      });

      expect(routeProcessor.getPaths()).toEqual({});
    });

    it("sorts paths by tag name and then by path depth", () => {
      routeProcessor = new RouteProcessor(
        baseConfig,
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );

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
      routeProcessor = new RouteProcessor(
        baseConfig,
        undefined,
        undefined,
        adapters.createFrameworkSource,
      );
      const scanApiRoutesSpy = vi.spyOn(routeProcessor, "scanApiRoutes").mockImplementation(() => ({
        scanRouteFilesMs: 0,
        processRouteFilesMs: 0,
        buildOperationsMs: 0,
      }));
      // @ts-expect-error overriding source in focused unit test
      routeProcessor.source = {
        getScanRoots: () => ["./missing-root", "."],
      };

      routeProcessor.scanRoutes();

      expect(scanApiRoutesSpy).toHaveBeenCalledTimes(1);
      expect(scanApiRoutesSpy).toHaveBeenCalledWith(".");
    });
  });

  it("throws when constructed without a framework source factory", () => {
    expect(() => new RouteProcessor(baseConfig)).toThrow(/framework source/i);
  });

  it("records leftover route-feature diagnostics and skips empty tags", () => {
    const diagnostics = {
      add: vi.fn<(diagnostic: Diagnostic) => void>(),
      getAll: vi.fn<() => Diagnostic[]>(() => []),
    };
    routeProcessor = new RouteProcessor(
      baseConfig,
      diagnostics,
      undefined,
      adapters.createFrameworkSource,
    );

    // @ts-expect-error exercising private diagnostics helper
    routeProcessor.registerRouteFeatureDiagnostics(
      "./src/app/api/[[...slug]]/route.ts",
      "/{slug}",
      {},
    );
    // @ts-expect-error exercising private diagnostics helper
    routeProcessor.registerRouteFeatureDiagnostics("./src/app/api/@modal/route.ts", "/modal", {});
    // @ts-expect-error exercising private diagnostics helper
    routeProcessor.registerRouteFeatureDiagnostics("./src/app/api/(.)photo/route.ts", "/photo", {});
    // @ts-expect-error exercising private tag helper
    routeProcessor.registerTagMetadata("./src/app/api/route.ts", "/", {});

    expect(diagnostics.add).toHaveBeenCalledWith(
      expect.objectContaining({ code: "unsupported-route-feature" }),
    );
    expect(diagnostics.add.mock.calls).toHaveLength(3);
    expect(routeProcessor.getTags()).toEqual([]);
  });

  it("merges a route file transaction only after every discovered operation succeeds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-route-transaction-"));
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(routeFile, "export async function GET() {}\n");
    const runtime = createSharedGenerationRuntime();
    runtime.schema.typescript.openapiDefinitions.Marker = { type: "string" };
    const processor = new RouteProcessor(
      {
        ...baseConfig,
        apiDir: root,
        schemaDir: root,
      },
      undefined,
      runtime,
      () => ({
        getScanRoots: () => [root],
        shouldProcessFile: () => true,
        getRoutePath: () => "/transaction",
        precheckFile: () => true,
        processFile: () => [
          { method: "GET", filePath: routeFile, routePath: "/transaction", dataTypes: {} },
          { method: "POST", filePath: routeFile, routePath: "/transaction", dataTypes: {} },
        ],
      }),
    );
    // @ts-expect-error exercising private integration point in focused unit test
    const originalRegister = processor.registerRoute.bind(processor);
    let registrations = 0;
    // @ts-expect-error exercising private integration point in focused unit test
    vi.spyOn(processor, "registerRoute").mockImplementation((...args) => {
      registrations += 1;
      if (registrations === 2) {
        throw new Error("second operation failed");
      }
      originalRegister(...args);
    });

    try {
      expect(() => processor.scanApiRoutes(root)).toThrow("second operation failed");
      expect(processor.getPaths()).toEqual({});
      expect(runtime.routeScan.routeFragments.size).toBe(0);
      expect(runtime.schema.typescript.openapiDefinitions).toEqual({});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reprocesses only the invalidated route while preserving exact cached output", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-route-incremental-"));
    const usersFile = path.join(root, "users.ts");
    const postsFile = path.join(root, "posts.ts");
    fs.writeFileSync(usersFile, "users-v1\n");
    fs.writeFileSync(postsFile, "posts-v1\n");
    const runtime = createSharedGenerationRuntime();
    const processFile = vi.fn<
      (filePath: string) => Array<{
        method: string;
        filePath: string;
        routePath: string;
        dataTypes: { summary: string };
      }>
    >((filePath) => {
      const routeName = path.basename(filePath, ".ts");
      return [
        {
          method: "GET",
          filePath,
          routePath: `/${routeName}`,
          dataTypes: { summary: fs.readFileSync(filePath, "utf8").trim() },
        },
      ];
    });
    const createSource = () => ({
      getScanRoots: () => [root],
      shouldProcessFile: (fileName: string) => fileName.endsWith(".ts"),
      getRoutePath: (filePath: string) => `/${path.basename(filePath, ".ts")}`,
      precheckFile: () => true,
      processFile,
    });
    const createProcessor = () =>
      new RouteProcessor(
        { ...baseConfig, apiDir: root, schemaDir: root },
        undefined,
        runtime,
        createSource,
      );

    try {
      const first = createProcessor();
      first.scanApiRoutes(root);
      const firstPaths = first.getPaths();
      expect(processFile).toHaveBeenCalledTimes(2);

      const warm = createProcessor();
      warm.scanApiRoutes(root);
      expect(warm.getPaths()).toEqual(firstPaths);
      expect(processFile).toHaveBeenCalledTimes(2);

      fs.writeFileSync(usersFile, "users-v2\n");
      invalidateRuntimeFile(runtime, usersFile);
      const incremental = createProcessor();
      incremental.scanApiRoutes(root);

      expect(processFile).toHaveBeenCalledTimes(3);
      expect(incremental.getPaths()["/posts"]).toEqual(firstPaths["/posts"]);
      expect(incremental.getPaths()["/users"]?.get?.summary).toBe("users-v2");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores schema-index diagnostics in reusable route fragments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-route-fragment-diagnostics-"));
    const routeFile = path.join(root, "route.ts");
    fs.writeFileSync(routeFile, "export async function GET() {}\n");
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(
      path.join(root, "node_modules", "route.ts"),
      "export async function GET() {}\n",
    );
    const runtime = createSharedGenerationRuntime();
    const createSource = () => ({
      getScanRoots: () => [root],
      shouldProcessFile: () => true,
      getRoutePath: () => "/diagnostics",
      precheckFile: () => true,
      processFile: () => [
        { method: "GET", filePath: routeFile, routePath: "/diagnostics", dataTypes: {} },
      ],
    });
    const config = {
      ...baseConfig,
      apiDir: root,
      schemaDir: path.join(root, "missing-schemas"),
    };

    try {
      const firstDiagnostics = new DiagnosticsCollector();
      new RouteProcessor(config, firstDiagnostics, runtime, createSource).scanApiRoutes(root);
      expect(runtime.routeScan.routeFragments.get(routeFile)?.diagnostics).toContainEqual(
        expect.objectContaining({ code: "schema-dir-empty" }),
      );
      expect(firstDiagnostics.getAll()).toContainEqual(
        expect.objectContaining({ code: "route-directory-ignored" }),
      );

      const cachedDiagnostics = new DiagnosticsCollector();
      new RouteProcessor(config, cachedDiagnostics, runtime, createSource).scanApiRoutes(root);
      expect(cachedDiagnostics.getAll()).toContainEqual(
        expect.objectContaining({ code: "schema-dir-empty" }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
