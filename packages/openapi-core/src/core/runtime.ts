import path from "node:path";

import type * as t from "@babel/types";

import { invalidateTypeScriptProject } from "../shared/typescript-project.js";

export type CachedFileContent = {
  content: string;
  mtimeMs: number;
  size: number;
};

export type SharedGenerationRuntime = {
  routeScan: {
    directoryCache: Record<string, string[]>;
    fileASTCache: Map<string, t.File>;
    fileContentCache: Map<string, CachedFileContent>;
    statCache: Record<string, import("node:fs").Stats>;
  };
  schema: {
    directoryCache: Record<string, string[]>;
    statCache: Record<string, import("node:fs").Stats>;
    fileASTCache: Map<string, import("@babel/types").File>;
    schemaFiles: string[] | null;
    schemaDefinitionIndex: Record<string, string[]>;
  };
};

export function createSharedGenerationRuntime(): SharedGenerationRuntime {
  return {
    routeScan: {
      directoryCache: {},
      fileASTCache: new Map(),
      fileContentCache: new Map(),
      statCache: {},
    },
    schema: {
      directoryCache: {},
      statCache: {},
      fileASTCache: new Map(),
      schemaFiles: null,
      schemaDefinitionIndex: {},
    },
  };
}

export function invalidateRuntimeFile(runtime: SharedGenerationRuntime, filePath: string): void {
  const absoluteFilePath = path.resolve(filePath);

  delete runtime.routeScan.statCache[absoluteFilePath];
  runtime.routeScan.fileASTCache.delete(absoluteFilePath);
  runtime.routeScan.fileContentCache.delete(absoluteFilePath);
  delete runtime.schema.statCache[absoluteFilePath];
  runtime.schema.fileASTCache.delete(absoluteFilePath);
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
  invalidateTypeScriptProject(absoluteFilePath);
}

export function invalidateRuntimeDirectory(
  runtime: SharedGenerationRuntime,
  directoryPath: string,
): void {
  const absoluteDirectoryPath = path.resolve(directoryPath);
  delete runtime.routeScan.directoryCache[absoluteDirectoryPath];
  delete runtime.schema.directoryCache[absoluteDirectoryPath];
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
}

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    delete record[key];
  }
}
