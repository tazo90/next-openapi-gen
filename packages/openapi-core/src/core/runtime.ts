import path from "node:path";

import type * as t from "@babel/types";

import { isPathWithin } from "../shared/path.js";
import type { Diagnostic, OpenApiPathItem, OpenApiSchema, OpenApiTag } from "../shared/types.js";
import {
  clearTypeScriptProjectCache,
  invalidateTypeScriptProject,
} from "../shared/typescript-project.js";

export type CachedFileContent = {
  content: string;
  mtimeMs: number;
  size: number;
};

export type CachedRouteFragment = {
  cacheKey: string;
  diagnostics: Diagnostic[];
  internalSchemas: Record<string, OpenApiSchema>;
  mtimeMs: number;
  paths: Record<string, OpenApiPathItem>;
  schemaDependencies: string[];
  schemas: Record<string, OpenApiSchema>;
  size: number;
  tags: Record<string, OpenApiTag>;
  webhooks: Record<string, OpenApiPathItem>;
};

export type SharedZodGenerationRuntime = {
  convertedSchemas: Record<string, OpenApiSchema>;
  drizzleZodImports: Set<string>;
  fileImportsCache: Map<string, Record<string, string>>;
  internalSchemaNames: Set<string>;
  metaIdSchemaNames: Set<string>;
  preprocessedFiles: Set<string>;
  preprocessedSchemaDirectories: Set<string>;
  preScanned: boolean;
  processedFileSchemaPairs: Set<string>;
  schemaNameToFiles: Map<string, Set<string>>;
  schemaVariantRefs: Map<string, string>;
  typeToSchemaMapping: Record<string, string>;
  variantSensitiveSchemaNames: Set<string>;
  zodImportAlias: Map<string, string>;
};

export type SharedTypeScriptGenerationRuntime = {
  indexedReExportFiles: Set<string>;
  inlineTypeCache: Map<string, OpenApiSchema>;
  internalSchemaNames: Set<string>;
  openapiDefinitions: Record<string, OpenApiSchema>;
  importMap: Record<string, Record<string, string>>;
  resolvedSchemaCache: Set<string>;
  schemaContentCache: Map<
    string,
    {
      body: OpenApiSchema;
      params: OpenApiSchema;
      pathParams: OpenApiSchema;
      querystring: OpenApiSchema;
      responses: OpenApiSchema;
      tag: OpenApiSchema;
    }
  >;
  schemaIdAliases: Record<string, string>;
  typeDefinitions: Record<string, OpenApiSchema>;
  typeToFileIndex: Map<string, string>;
};

export type SharedGenerationRuntime = {
  routeScan: {
    directoryCache: Record<string, string[]>;
    fileASTCache: Map<string, t.File>;
    fileContentCache: Map<string, CachedFileContent>;
    routeFragments: Map<string, CachedRouteFragment>;
    statCache: Record<string, import("node:fs").Stats>;
  };
  schema: {
    directoryCache: Record<string, string[]>;
    statCache: Record<string, import("node:fs").Stats>;
    fileASTCache: Map<string, import("@babel/types").File>;
    schemaFiles: string[] | null;
    schemaDefinitionIndex: Record<string, string[]>;
    typescript: SharedTypeScriptGenerationRuntime;
    zod: SharedZodGenerationRuntime;
  };
};

export function createSharedGenerationRuntime(): SharedGenerationRuntime {
  return {
    routeScan: {
      directoryCache: {},
      fileASTCache: new Map(),
      fileContentCache: new Map(),
      routeFragments: new Map(),
      statCache: {},
    },
    schema: {
      directoryCache: {},
      statCache: {},
      fileASTCache: new Map(),
      schemaFiles: null,
      schemaDefinitionIndex: {},
      typescript: createSharedTypeScriptGenerationRuntime(),
      zod: createSharedZodGenerationRuntime(),
    },
  };
}

export function invalidateRuntimeFile(runtime: SharedGenerationRuntime, filePath: string): void {
  invalidateRuntimePaths(runtime, { files: [filePath] });
}

export function invalidateRuntimeDirectory(
  runtime: SharedGenerationRuntime,
  directoryPath: string,
): void {
  invalidateRuntimePaths(runtime, { directories: [directoryPath] });
}

export function invalidateRuntimePaths(
  runtime: SharedGenerationRuntime,
  paths: {
    files?: Iterable<string> | undefined;
    directories?: Iterable<string> | undefined;
  },
): void {
  const files = new Set([...(paths.files ?? [])].map((filePath) => path.resolve(filePath)));
  const directories = [
    ...new Set([...(paths.directories ?? [])].map((directoryPath) => path.resolve(directoryPath))),
  ];
  if (files.size === 0 && directories.length === 0) {
    return;
  }
  const filePaths = [...files];

  for (const filePath of files) {
    delete runtime.routeScan.statCache[filePath];
    runtime.routeScan.fileASTCache.delete(filePath);
    runtime.routeScan.fileContentCache.delete(filePath);
    delete runtime.schema.statCache[filePath];
    runtime.schema.fileASTCache.delete(filePath);
  }
  for (const directoryPath of directories) {
    delete runtime.routeScan.directoryCache[directoryPath];
    delete runtime.schema.directoryCache[directoryPath];
  }
  for (const cachedDirectory of Object.keys(runtime.routeScan.directoryCache)) {
    if (filePaths.some((filePath) => isPathWithin(cachedDirectory, filePath))) {
      delete runtime.routeScan.directoryCache[cachedDirectory];
    }
  }
  for (const cachedDirectory of Object.keys(runtime.schema.directoryCache)) {
    if (filePaths.some((filePath) => isPathWithin(cachedDirectory, filePath))) {
      delete runtime.schema.directoryCache[cachedDirectory];
    }
  }

  for (const [filePath, fragment] of runtime.routeScan.routeFragments) {
    if (
      files.has(filePath) ||
      fragment.schemaDependencies.some((dependency) => files.has(dependency))
    ) {
      runtime.routeScan.routeFragments.delete(filePath);
    }
  }
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
  clearTypeScriptRuntime(runtime.schema.typescript);
  clearZodRuntime(runtime.schema.zod);
  for (const filePath of files) {
    invalidateTypeScriptProject(filePath);
  }
}

export function resetSharedGenerationRuntime(runtime: SharedGenerationRuntime): void {
  clearRecord(runtime.routeScan.directoryCache);
  clearRecord(runtime.routeScan.statCache);
  runtime.routeScan.fileASTCache.clear();
  runtime.routeScan.fileContentCache.clear();
  runtime.routeScan.routeFragments.clear();
  clearRecord(runtime.schema.directoryCache);
  clearRecord(runtime.schema.statCache);
  runtime.schema.fileASTCache.clear();
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
  clearTypeScriptRuntime(runtime.schema.typescript);
  clearZodRuntime(runtime.schema.zod);
  clearTypeScriptProjectCache();
}

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    delete record[key];
  }
}

function createSharedZodGenerationRuntime(): SharedZodGenerationRuntime {
  return {
    convertedSchemas: {},
    drizzleZodImports: new Set(),
    fileImportsCache: new Map(),
    internalSchemaNames: new Set(),
    metaIdSchemaNames: new Set(),
    preprocessedFiles: new Set(),
    preprocessedSchemaDirectories: new Set(),
    preScanned: false,
    processedFileSchemaPairs: new Set(),
    schemaNameToFiles: new Map(),
    schemaVariantRefs: new Map(),
    typeToSchemaMapping: {},
    variantSensitiveSchemaNames: new Set(),
    zodImportAlias: new Map(),
  };
}

function createSharedTypeScriptGenerationRuntime(): SharedTypeScriptGenerationRuntime {
  return {
    indexedReExportFiles: new Set(),
    inlineTypeCache: new Map(),
    internalSchemaNames: new Set(),
    openapiDefinitions: {},
    importMap: {},
    resolvedSchemaCache: new Set(),
    schemaContentCache: new Map(),
    schemaIdAliases: {},
    typeDefinitions: {},
    typeToFileIndex: new Map(),
  };
}

function clearTypeScriptRuntime(runtime: SharedTypeScriptGenerationRuntime): void {
  clearRecord(runtime.openapiDefinitions);
  clearRecord(runtime.importMap);
  clearRecord(runtime.schemaIdAliases);
  clearRecord(runtime.typeDefinitions);
  runtime.indexedReExportFiles.clear();
  runtime.inlineTypeCache.clear();
  runtime.internalSchemaNames.clear();
  runtime.resolvedSchemaCache.clear();
  runtime.schemaContentCache.clear();
  runtime.typeToFileIndex.clear();
}

function clearZodRuntime(runtime: SharedZodGenerationRuntime): void {
  clearRecord(runtime.convertedSchemas);
  clearRecord(runtime.typeToSchemaMapping);
  runtime.drizzleZodImports.clear();
  runtime.fileImportsCache.clear();
  runtime.internalSchemaNames.clear();
  runtime.metaIdSchemaNames.clear();
  runtime.preprocessedFiles.clear();
  runtime.preprocessedSchemaDirectories.clear();
  runtime.preScanned = false;
  runtime.processedFileSchemaPairs.clear();
  runtime.schemaNameToFiles.clear();
  runtime.schemaVariantRefs.clear();
  runtime.zodImportAlias.clear();
  runtime.variantSensitiveSchemaNames.clear();
}
