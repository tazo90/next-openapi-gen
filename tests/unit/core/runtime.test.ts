import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSharedGenerationRuntime,
  invalidateRuntimeDirectory,
  invalidateRuntimeFile,
} from "@workspace/openapi-core/core/runtime.js";

describe("shared generation runtime", () => {
  it("creates empty caches and invalidates file-scoped entries", () => {
    const runtime = createSharedGenerationRuntime();
    const absoluteFile = path.resolve("/tmp/nxog-runtime-file-invalidate");

    runtime.routeScan.statCache[absoluteFile] = {} as import("node:fs").Stats;
    runtime.schema.statCache[absoluteFile] = {} as import("node:fs").Stats;
    runtime.schema.fileASTCache.set(absoluteFile, {} as import("@babel/types").File);
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
});
