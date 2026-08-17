import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSharedGenerationRuntime,
  invalidateRuntimeDirectory,
  invalidateRuntimeFile,
  invalidateRuntimePaths,
  resetSharedGenerationRuntime,
} from "@workspace/openapi-core/core/runtime.js";

describe("shared generation runtime", () => {
  it("creates empty caches and invalidates file-scoped entries", () => {
    const runtime = createSharedGenerationRuntime();
    const absoluteFile = path.resolve("/tmp/nxog-runtime-file-invalidate");

    runtime.routeScan.statCache[absoluteFile] = {} as import("node:fs").Stats;
    runtime.schema.statCache[absoluteFile] = {} as import("node:fs").Stats;
    runtime.schema.fileASTCache.set(absoluteFile, {});
    runtime.schema.schemaFiles = ["x"];
    runtime.schema.schemaDefinitionIndex["k"] = ["v"];

    invalidateRuntimeFile(runtime, absoluteFile);

    expect(runtime.routeScan.statCache[absoluteFile]).toBeUndefined();
    expect(runtime.schema.statCache[absoluteFile]).toBeUndefined();
    expect(runtime.schema.fileASTCache.has(absoluteFile)).toBe(false);
    expect(runtime.schema.schemaFiles).toBeNull();
    expect(runtime.schema.schemaDefinitionIndex).toEqual({});
  });

  it("invalidates directory caches without touching unrelated stat entries", () => {
    const runtime = createSharedGenerationRuntime();
    const absoluteDir = path.resolve("/tmp/nxog-runtime-dir-invalidate");

    runtime.routeScan.directoryCache[absoluteDir] = ["a.ts"];
    runtime.schema.directoryCache[absoluteDir] = ["b.ts"];
    runtime.schema.schemaFiles = ["schema.ts"];
    runtime.schema.schemaDefinitionIndex["k"] = ["v"];

    invalidateRuntimeDirectory(runtime, absoluteDir);

    expect(runtime.routeScan.directoryCache[absoluteDir]).toBeUndefined();
    expect(runtime.schema.directoryCache[absoluteDir]).toBeUndefined();
    expect(runtime.schema.schemaFiles).toBeNull();
    expect(runtime.schema.schemaDefinitionIndex).toEqual({});
  });

  it("does not broaden directory-list invalidation to route fragments", () => {
    const runtime = createSharedGenerationRuntime();
    const absoluteDir = path.resolve("/tmp/nxog-runtime-dir-fragments");
    const nestedFile = path.join(absoluteDir, "users", "route.ts");
    const siblingFile = path.resolve("/tmp/other-app/route.ts");
    const dependentFile = path.resolve("/tmp/api/dependent/route.ts");

    runtime.routeScan.routeFragments.set(nestedFile, {
      cacheKey: "nested",
      diagnostics: [],
      internalSchemas: {},
      mtimeMs: 1,
      paths: {},
      schemaDependencies: [],
      schemas: {},
      size: 1,
      tags: {},
      webhooks: {},
    });
    runtime.routeScan.routeFragments.set(siblingFile, {
      cacheKey: "sibling",
      diagnostics: [],
      internalSchemas: {},
      mtimeMs: 1,
      paths: {},
      schemaDependencies: [],
      schemas: {},
      size: 1,
      tags: {},
      webhooks: {},
    });
    runtime.routeScan.routeFragments.set(dependentFile, {
      cacheKey: "dependent",
      diagnostics: [],
      internalSchemas: {},
      mtimeMs: 1,
      paths: {},
      schemaDependencies: [path.join(absoluteDir, "schemas", "user.ts")],
      schemas: {},
      size: 1,
      tags: {},
      webhooks: {},
    });

    invalidateRuntimeDirectory(runtime, absoluteDir);

    expect(runtime.routeScan.routeFragments.has(nestedFile)).toBe(true);
    expect(runtime.routeScan.routeFragments.has(dependentFile)).toBe(true);
    expect(runtime.routeScan.routeFragments.has(siblingFile)).toBe(true);
  });

  it("invalidates only route fragments that depend on a changed schema file", () => {
    const runtime = createSharedGenerationRuntime();
    const schemaFile = path.resolve("/tmp/schemas/user.ts");
    const dependentRoute = path.resolve("/tmp/api/users/route.ts");
    const independentRoute = path.resolve("/tmp/api/posts/route.ts");
    const createFragment = (schemaDependencies: string[]) => ({
      cacheKey: "fragment",
      diagnostics: [],
      internalSchemas: {},
      mtimeMs: 1,
      paths: {},
      schemaDependencies,
      schemas: {},
      size: 1,
      tags: {},
      webhooks: {},
    });
    runtime.routeScan.routeFragments.set(dependentRoute, createFragment([schemaFile]));
    runtime.routeScan.routeFragments.set(independentRoute, createFragment([]));

    invalidateRuntimeFile(runtime, schemaFile);

    expect(runtime.routeScan.routeFragments.has(dependentRoute)).toBe(false);
    expect(runtime.routeScan.routeFragments.has(independentRoute)).toBe(true);
  });

  it("batch invalidates deduplicated files and directories with exact schema dependencies", () => {
    const runtime = createSharedGenerationRuntime();
    const apiDir = path.resolve("/tmp/nxog-runtime-batch/api");
    const changedRoute = path.join(apiDir, "users", "route.ts");
    const nestedRoute = path.join(apiDir, "posts", "route.ts");
    const schemaFile = path.resolve("/tmp/nxog-runtime-batch/schemas/user.ts");
    const dependentRoute = path.resolve("/tmp/nxog-runtime-batch/dependent/route.ts");
    const similarDependencyRoute = path.resolve("/tmp/nxog-runtime-batch/similar/route.ts");
    const createFragment = (schemaDependencies: string[]) => ({
      cacheKey: "fragment",
      diagnostics: [],
      internalSchemas: {},
      mtimeMs: 1,
      paths: {},
      schemaDependencies,
      schemas: {},
      size: 1,
      tags: {},
      webhooks: {},
    });

    runtime.routeScan.routeFragments.set(changedRoute, createFragment([]));
    runtime.routeScan.routeFragments.set(nestedRoute, createFragment([]));
    runtime.routeScan.routeFragments.set(dependentRoute, createFragment([schemaFile]));
    runtime.routeScan.routeFragments.set(
      similarDependencyRoute,
      createFragment([`${schemaFile}x`]),
    );

    invalidateRuntimePaths(runtime, {
      files: [changedRoute, schemaFile, changedRoute],
      directories: [path.dirname(nestedRoute), path.dirname(nestedRoute)],
    });

    expect(runtime.routeScan.routeFragments.has(changedRoute)).toBe(false);
    expect(runtime.routeScan.routeFragments.has(nestedRoute)).toBe(true);
    expect(runtime.routeScan.routeFragments.has(dependentRoute)).toBe(false);
    expect(runtime.routeScan.routeFragments.has(similarDependencyRoute)).toBe(true);
  });

  it("fully resets shared runtime state when cache metadata cannot be trusted", () => {
    const runtime = createSharedGenerationRuntime();
    const filePath = path.resolve("/tmp/nxog-runtime-reset/route.ts");
    const directoryPath = path.dirname(filePath);
    runtime.routeScan.directoryCache[directoryPath] = ["route.ts"];
    runtime.routeScan.statCache[filePath] = {} as import("node:fs").Stats;
    runtime.routeScan.fileContentCache.set(filePath, { content: "stale", mtimeMs: 1, size: 5 });
    runtime.schema.directoryCache[directoryPath] = ["schema.ts"];
    runtime.schema.schemaFiles = ["schema.ts"];
    runtime.schema.typescript.typeDefinitions.Stale = { type: "string" };
    runtime.schema.zod.convertedSchemas.Stale = { type: "string" };

    resetSharedGenerationRuntime(runtime);

    expect(runtime.routeScan.directoryCache).toEqual({});
    expect(runtime.routeScan.statCache).toEqual({});
    expect(runtime.routeScan.fileContentCache.size).toBe(0);
    expect(runtime.schema.directoryCache).toEqual({});
    expect(runtime.schema.schemaFiles).toBeNull();
    expect(runtime.schema.typescript.typeDefinitions).toEqual({});
    expect(runtime.schema.zod.convertedSchemas).toEqual({});
  });
});
