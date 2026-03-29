import path from "node:path";

import { invalidateTypeScriptProject } from "../shared/typescript-project.js";

export type SharedGenerationRuntime = {
  routeScan: {
    directoryCache: Record<string, string[]>;
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
