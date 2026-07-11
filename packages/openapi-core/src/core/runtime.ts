import path from "node:path";

import type * as t from "@babel/types";

import type {
  Diagnostic,
  OpenAPIDefinition,
  OpenApiPathDefinition,
  OpenApiSchema,
  OpenApiTagDefinition,
} from "../shared/types.js";
import { invalidateTypeScriptProject } from "../shared/typescript-project.js";

export type CachedFileContent = {
  content: string;
  mtimeMs: number;
  size: number;
};

export type CachedRouteFragment = {
  cacheKey: string;
  diagnostics: Diagnostic[];
  internalSchemas: Record<string, OpenAPIDefinition>;
  mtimeMs: number;
  paths: Record<string, OpenApiPathDefinition>;
  schemas: Record<string, OpenAPIDefinition>;
  size: number;
  tags: Record<string, OpenApiTagDefinition>;
  webhooks: Record<string, OpenApiPathDefinition>;
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
      zod: createSharedZodGenerationRuntime(),
    },
  };
}

export function invalidateRuntimeFile(runtime: SharedGenerationRuntime, filePath: string): void {
  const absoluteFilePath = path.resolve(filePath);

  delete runtime.routeScan.statCache[absoluteFilePath];
  runtime.routeScan.fileASTCache.delete(absoluteFilePath);
  runtime.routeScan.fileContentCache.delete(absoluteFilePath);
  runtime.routeScan.routeFragments.delete(absoluteFilePath);
  delete runtime.schema.statCache[absoluteFilePath];
  runtime.schema.fileASTCache.delete(absoluteFilePath);
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
  clearZodRuntime(runtime.schema.zod);
  invalidateTypeScriptProject(absoluteFilePath);
}

export function invalidateRuntimeDirectory(
  runtime: SharedGenerationRuntime,
  directoryPath: string,
): void {
  const absoluteDirectoryPath = path.resolve(directoryPath);
  delete runtime.routeScan.directoryCache[absoluteDirectoryPath];
  delete runtime.schema.directoryCache[absoluteDirectoryPath];
  for (const filePath of runtime.routeScan.routeFragments.keys()) {
    const relativePath = path.relative(absoluteDirectoryPath, filePath);
    if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
      runtime.routeScan.routeFragments.delete(filePath);
    }
  }
  runtime.schema.schemaFiles = null;
  clearRecord(runtime.schema.schemaDefinitionIndex);
  clearZodRuntime(runtime.schema.zod);
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
