import fs from "fs";
import path from "path";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { measurePerformance, type GenerationPerformanceProfile } from "../../core/performance.js";
import type { SharedZodGenerationRuntime } from "../../core/runtime.js";
import type { DiagnosticsCollector } from "../../diagnostics/collector.js";
import { traverse } from "../../shared/babel-traverse.js";
import { extractInternalFlagFromComments } from "../../shared/jsdoc.js";
import { logger } from "../../shared/logger.js";
import { parseTypeScriptFile } from "../../shared/parse-typescript.js";
import { SymbolResolver } from "../../shared/symbol-resolver.js";
import type { ContentType, Diagnostic, OpenApiSchema } from "../../shared/types.js";
import {
  expandFactoryCall,
  extractReturnNode,
  parseFileWithCache,
  substituteParameters,
} from "./converter-runtime.js";
import {
  IGNORED_DIRS,
  collectZodRouteFiles,
  processZodSchemaFilesInDirectory,
} from "./file-processor.js";
import {
  FUNCTIONAL_CHECK_TO_CHAIN_METHOD,
  FUNCTIONAL_FORMAT_CHECKS,
  FUNCTIONAL_NOOP_CHECKS,
} from "./functional-checks.js";
import { processImports } from "./import-processor.js";
import {
  escapeRegExp,
  extractDescriptionFromArguments,
  hasOptionalMethod,
  isOptionalCall,
  isOptionalUnionCall,
  processZodDiscriminatedUnion,
  processZodIntersection,
  processZodLiteral,
  processZodPrimitiveNode,
  processZodTuple,
  processZodUnion,
} from "./node-helpers.js";
import {
  collectImportMetadata,
  extractTypeMappingsFromAST,
  findFactoryFunctionNode,
  isZodSchemaNode,
  returnsZodSchemaNode,
} from "./prescan.js";
import { ZodRuntimeExporter } from "./runtime-exporter.js";
import { applyZodChainMethod as applyZodChainMethodValue } from "./zod-chain.js";
import { convertZodNode } from "./zod-node.js";

type ZodConverterFileAccess = Pick<
  typeof fs,
  "existsSync" | "readdirSync" | "statSync" | "readFileSync"
>;

const defaultFileAccess: ZodConverterFileAccess = fs;

const SUPPORTED_ZOD_HELPERS = new Set([
  "any",
  "array",
  "base64",
  "base64url",
  "bigint",
  "boolean",
  "cidr",
  "cidrv4",
  "cidrv6",
  "codec",
  "custom",
  "catch",
  "cuid",
  "cuid2",
  "date",
  "datetime",
  "default",
  "describe",
  "discriminatedUnion",
  "e164",
  "email",
  "emoji",
  "enum",
  "extend",
  "file",
  "float32",
  "float64",
  "function",
  "guid",
  "hash",
  "hex",
  "hostname",
  "httpUrl",
  "ip",
  "instanceof",
  "int",
  "int32",
  "int64",
  "intersection",
  "ipv4",
  "ipv6",
  "iso.date",
  "iso.datetime",
  "iso.duration",
  "iso.time",
  "json",
  "jwt",
  "ksuid",
  "lazy",
  "literal",
  "looseObject",
  "map",
  "nan",
  "nanoid",
  "nativeEnum",
  "never",
  "null",
  "nullable",
  "nullish",
  "number",
  "object",
  "optional",
  "partialRecord",
  "pipe",
  "pipeline",
  "prefault",
  "preprocess",
  "promise",
  "readonly",
  "record",
  "set",
  "strictObject",
  "string",
  "stringbool",
  "symbol",
  "templateLiteral",
  "tuple",
  "uint32",
  "uint64",
  "undefined",
  "union",
  "unknown",
  "ulid",
  "url",
  "uuid",
  "uuidv4",
  "uuidv6",
  "uuidv7",
  "void",
  "xid",
]);

const SUPPORTED_ZOD_CHAIN_METHODS = new Set([
  "and",
  "base64",
  "base64url",
  "brand",
  "catch",
  "catchall",
  "check",
  "cidr",
  "cidrv4",
  "cidrv6",
  "cuid",
  "cuid2",
  "date",
  "datetime",
  "deepPartial",
  "default",
  "deprecated",
  "describe",
  "duration",
  "e164",
  "email",
  "emoji",
  "endsWith",
  "extend",
  "finite",
  "guid",
  "hash",
  "hex",
  "hostname",
  "httpUrl",
  "includes",
  "int",
  "ip",
  "ipv4",
  "ipv6",
  "jwt",
  "keyof",
  "ksuid",
  "length",
  "max",
  "maxSize",
  "merge",
  "meta",
  "mime",
  "min",
  "minSize",
  "multipleOf",
  "nanoid",
  "negative",
  "nonempty",
  "nonnegative",
  "nonoptional",
  "nonpositive",
  "nullable",
  "nullish",
  "omit",
  "optional",
  "or",
  "overwrite",
  "partial",
  "passthrough",
  "pick",
  "pipe",
  "positive",
  "prefault",
  "readonly",
  "refine",
  "regex",
  "required",
  "rest",
  "safe",
  "startsWith",
  "step",
  "strict",
  "strip",
  "superRefine",
  "time",
  "toLowerCase",
  "toUpperCase",
  "transform",
  "trim",
  "ulid",
  "uri",
  "url",
  "uuid",
  "uuidv4",
  "uuidv6",
  "uuidv7",
  "xid",
]);

/**
 * Class for converting Zod schemas to OpenAPI specifications
 */
export class ZodSchemaConverter {
  schemaDirs: string[];
  apiDir: string | undefined;
  zodSchemas: Record<string, OpenApiSchema> = {};
  processingSchemas: Set<string> = new Set();
  /** Memoization guard for processFileForZodSchema. Keys: `${filePath}|${schemaName}`.
   * Prevents infinite recursion when re-export files reference schemas via z.infer<typeof X>. */
  processedFileSchemaPairs: Set<string> = new Set();
  typeToSchemaMapping: Record<string, string> = {};
  drizzleZodImports: Set<string> = new Set();
  factoryCache: Map<string, t.Node> = new Map(); // Cache for analyzed factory functions
  factoryCheckCache: Map<string, boolean> = new Map(); // Cache for non-factory functions
  fileASTCache: Map<string, t.File> = new Map(); // Cache for parsed files
  fileImportsCache: Map<string, Record<string, string>> = new Map(); // Cache for file imports
  routeFilesCache: string[] | null = null;
  schemaFilesCache: Map<string, string[]> = new Map();
  preprocessedFiles: Set<string> = new Set();
  schemaVariantRefs: Map<string, string> = new Map();
  /** Reverse index: schema name -> file(s) that declare it. Populated during pre-scan. */
  schemaNameToFiles: Map<string, Set<string>> = new Map();
  /** Per-file import alias for the `zod` module (`import { z as zod }` sets this to `"zod"`). */
  zodImportAlias: Map<string, string> = new Map();
  /** Per-file Zod import source (`zod`, `zod/mini`, etc.). */
  zodImportSource: Map<string, string> = new Map();
  /** Schema variable names whose component name was overridden via .meta({ id }). These must
   *  NOT be copied back under the original variable name in the OpenAPI components object. */
  metaIdSchemaNames: Set<string> = new Set();
  /** Schema variable names marked @internal — excluded from components/schemas output. */
  internalSchemaNames: Set<string> = new Set();
  variantSensitiveSchemaNames: Set<string> = new Set();
  // Current processing context (set during file processing)
  currentFilePath?: string;
  currentAST?: t.File;
  currentImports?: Record<string, string>;
  currentContentType: ContentType = "response";
  private readonly fileAccess: ZodConverterFileAccess;
  private readonly runtimeExporter = new ZodRuntimeExporter();
  private readonly diagnostics: DiagnosticsCollector | undefined;
  private readonly emittedUnknownDiagnostics = new Set<string>();
  private readonly performanceProfile: GenerationPerformanceProfile | undefined;
  private readonly runtimeState: SharedZodGenerationRuntime | undefined;
  private hasPreScanned = false;
  private currentSchemaUsedRuntimeExport = false;
  /** Shared symbol resolver — replaces ad-hoc per-call AST traversals. */
  readonly symbolResolver: SymbolResolver;

  constructor(
    schemaDir: string | string[],
    apiDir?: string,
    fileAccess: ZodConverterFileAccess = defaultFileAccess,
    diagnostics?: DiagnosticsCollector,
    fileASTCache?: Map<string, t.File>,
    runtimeState?: SharedZodGenerationRuntime,
    performanceProfile?: GenerationPerformanceProfile,
  ) {
    const dirs = Array.isArray(schemaDir) ? schemaDir : [schemaDir];
    this.schemaDirs = dirs.map((d) => path.resolve(d));
    this.apiDir = apiDir ? path.resolve(apiDir) : undefined;
    this.fileAccess = fileAccess;
    this.diagnostics = diagnostics;
    this.performanceProfile = performanceProfile;
    this.runtimeState = runtimeState;
    if (fileASTCache) {
      this.fileASTCache = fileASTCache;
    }
    if (runtimeState) {
      this.zodSchemas = runtimeState.convertedSchemas;
      this.drizzleZodImports = runtimeState.drizzleZodImports;
      this.fileImportsCache = runtimeState.fileImportsCache;
      this.preprocessedFiles = runtimeState.preprocessedFiles;
      this.processedFileSchemaPairs = runtimeState.processedFileSchemaPairs;
      this.schemaVariantRefs = runtimeState.schemaVariantRefs;
      this.schemaNameToFiles = runtimeState.schemaNameToFiles;
      this.zodImportAlias = runtimeState.zodImportAlias;
      this.metaIdSchemaNames = runtimeState.metaIdSchemaNames;
      this.internalSchemaNames = runtimeState.internalSchemaNames;
      this.variantSensitiveSchemaNames = runtimeState.variantSensitiveSchemaNames;
      this.typeToSchemaMapping = runtimeState.typeToSchemaMapping;
      this.hasPreScanned = runtimeState.preScanned;
    }
    this.symbolResolver = new SymbolResolver(fileAccess, this.fileASTCache);
  }

  /**
   * Find a Zod schema by name and convert it to OpenAPI spec
   */
  convertZodSchemaToOpenApi(
    schemaName: string,
    contentType: ContentType = this.currentContentType,
  ): OpenApiSchema | null {
    const conversionStartedAt = performance.now();
    this.currentContentType = contentType || "response";

    if (!this.hasPreScanned) {
      measurePerformance(this.performanceProfile, "zodPreScanMs", () => {
        this.preScanForTypeMappings();
      });
      this.hasPreScanned = true;
      if (this.runtimeState) {
        this.runtimeState.preScanned = true;
      }
    }

    logger.debug(`Looking for Zod schema: ${schemaName}`);

    // Check mapped types
    const requestedSchemaName = schemaName;
    let mappedSchemaName = this.typeToSchemaMapping[schemaName];

    // Reverse-convention fallback (issue #131): when `Slider = z.infer<typeof sliderSchema>`
    // lives outside any scanned file, no mapping exists. Derive the candidate schema name
    // from the type name and verify it is present in schemaDirs before committing.
    if (!mappedSchemaName) {
      const candidate = this.deriveSchemaNameByConvention(schemaName);
      if (candidate && this.locateSchemaByConvention(candidate)) {
        this.typeToSchemaMapping[schemaName] = candidate;
        mappedSchemaName = candidate;
      }
    }

    if (mappedSchemaName) {
      logger.debug(`Type '${schemaName}' is mapped to schema '${mappedSchemaName}'`);
      schemaName = mappedSchemaName;
    }

    const cachedSchema = this.getStoredSchema(schemaName, this.currentContentType, false);
    if (cachedSchema) {
      this.applyTypeAliasComponent(requestedSchemaName, schemaName, mappedSchemaName);
      return cachedSchema;
    }

    // Check for circular references
    if (this.processingSchemas.has(schemaName)) {
      return { $ref: `#/components/schemas/${this.getSchemaReferenceName(schemaName)}` };
    }

    // Add to processing set
    this.processingSchemas.add(schemaName);

    try {
      // Fast path: reverse-index hit from a previous pass
      const indexedFiles = this.schemaNameToFiles.get(schemaName);
      if (indexedFiles && indexedFiles.size > 0) {
        for (const filePath of indexedFiles) {
          this.processFileForZodSchema(filePath, schemaName);
          const indexedSchema = this.getStoredSchema(schemaName, this.currentContentType, false);
          if (indexedSchema) {
            logger.debug(`Found Zod schema '${schemaName}' via reverse index: ${filePath}`);
            return indexedSchema;
          }
        }
      }

      // Schema modules are the common case. Prefer them before falling back to
      // route files so JSDoc-only references do not trigger route-file parsing.
      for (const dir of this.schemaDirs) {
        this.scanDirectoryForZodSchema(dir, schemaName);
        if (this.getStoredSchema(schemaName)) break;
      }

      const schemaDirSchema = this.getStoredSchema(schemaName);
      if (schemaDirSchema) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        return schemaDirSchema;
      }

      // Fallback for projects that define Zod schemas inline in route files.
      const routeFiles = this.findRouteFiles();
      for (const routeFile of routeFiles) {
        this.processFileForZodSchema(routeFile, schemaName);

        const routeSchema = this.getStoredSchema(schemaName, this.currentContentType, false);
        if (routeSchema) {
          logger.debug(`Found Zod schema '${schemaName}' in route file: ${routeFile}`);
          return routeSchema;
        }
      }

      // Return the schema if found, or null if not
      const resolvedSchema = this.getStoredSchema(schemaName);
      if (resolvedSchema) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        return resolvedSchema;
      }

      logger.debug(`Could not find Zod schema: ${schemaName}`);
      return null;
    } finally {
      if (this.performanceProfile) {
        this.performanceProfile.zodConvertMs += performance.now() - conversionStartedAt;
      }
      // Remove from processing set
      this.processingSchemas.delete(schemaName);
      this.applyTypeAliasComponent(requestedSchemaName, schemaName, mappedSchemaName);
    }
  }

  private applyTypeAliasComponent(
    requestedSchemaName: string,
    resolvedSchemaName: string,
    mappedSchemaName: string | undefined,
  ): void {
    if (!mappedSchemaName || requestedSchemaName === resolvedSchemaName) {
      return;
    }

    const resolvedReference = this.getSchemaReferenceName(
      resolvedSchemaName,
      this.currentContentType,
    );
    // Copy schema under alias name so OpenAPI components use the alias — but only for
    // type-alias mappings (z.infer<typeof X>), not for .meta({ id }) overrides which
    // intentionally rename the component and must not reintroduce the original name.
    if (
      !this.metaIdSchemaNames.has(requestedSchemaName) &&
      this.zodSchemas[resolvedReference] &&
      !this.zodSchemas[requestedSchemaName]
    ) {
      this.zodSchemas[requestedSchemaName] = this.zodSchemas[resolvedReference];
    }
    this.schemaVariantRefs.set(
      this.getVariantKey(requestedSchemaName, this.currentContentType),
      this.zodSchemas[requestedSchemaName] ? requestedSchemaName : resolvedReference,
    );
  }

  public getSchemaReferenceName(
    schemaName: string,
    contentType: ContentType = this.currentContentType,
  ): string {
    // Check alias variant ref first (set by convertZodSchemaToOpenApi for mapped types)
    const aliasRef = this.schemaVariantRefs.get(this.getVariantKey(schemaName, contentType));
    if (aliasRef) {
      return aliasRef;
    }

    const normalizedName = this.typeToSchemaMapping[schemaName] ?? schemaName;
    return (
      this.schemaVariantRefs.get(this.getVariantKey(normalizedName, contentType)) ?? normalizedName
    );
  }

  private getVariantKey(schemaName: string, contentType: ContentType): string {
    return `${contentType || "response"}:${schemaName}`;
  }

  private getStoredSchema(
    schemaName: string,
    contentType: ContentType = this.currentContentType,
    allowBaseFallback: boolean = true,
  ): OpenApiSchema | null {
    const normalizedName = this.typeToSchemaMapping[schemaName] ?? schemaName;
    const explicitReferenceName = this.schemaVariantRefs.get(
      this.getVariantKey(normalizedName, contentType),
    );
    if (explicitReferenceName) {
      return this.zodSchemas[explicitReferenceName] ?? null;
    }

    if (allowBaseFallback || !this.variantSensitiveSchemaNames.has(normalizedName)) {
      return this.zodSchemas[normalizedName] ?? null;
    }
    return null;
  }

  private storeResolvedSchema(
    schemaName: string,
    schema: OpenApiSchema,
    contentType: ContentType = this.currentContentType,
  ): string {
    const normalizedName = this.typeToSchemaMapping[schemaName] ?? schemaName;
    const schemaUsesRuntimeExport = this.currentSchemaUsedRuntimeExport;
    this.currentSchemaUsedRuntimeExport = false;
    if (schemaUsesRuntimeExport) {
      this.variantSensitiveSchemaNames.add(normalizedName);
    }
    const variantKey = this.getVariantKey(normalizedName, contentType);
    const existingBaseSchema = this.zodSchemas[normalizedName];

    if (!existingBaseSchema) {
      this.zodSchemas[normalizedName] = schema;
      this.schemaVariantRefs.set(variantKey, normalizedName);
      if (!this.variantSensitiveSchemaNames.has(normalizedName)) {
        this.registerCommonVariantRefs(normalizedName);
      }
      return normalizedName;
    }

    if (areSchemasEquivalent(existingBaseSchema, schema)) {
      this.schemaVariantRefs.set(variantKey, normalizedName);
      return normalizedName;
    }

    if (contentType === "response" || contentType === "") {
      const outputName = `${normalizedName}Output`;
      this.zodSchemas[outputName] = schema;
      this.schemaVariantRefs.set(variantKey, outputName);
      return outputName;
    }

    const outputName = `${normalizedName}Output`;
    this.zodSchemas[outputName] = existingBaseSchema;
    this.zodSchemas[normalizedName] = schema;
    this.schemaVariantRefs.set(this.getVariantKey(normalizedName, "response"), outputName);
    this.schemaVariantRefs.set(this.getVariantKey(normalizedName, "body"), normalizedName);
    this.schemaVariantRefs.set(this.getVariantKey(normalizedName, "params"), normalizedName);
    this.schemaVariantRefs.set(this.getVariantKey(normalizedName, "pathParams"), normalizedName);
    this.schemaVariantRefs.set(variantKey, normalizedName);
    return normalizedName;
  }

  private registerCommonVariantRefs(schemaName: string): void {
    this.schemaVariantRefs.set(this.getVariantKey(schemaName, "response"), schemaName);
    this.schemaVariantRefs.set(this.getVariantKey(schemaName, "body"), schemaName);
    this.schemaVariantRefs.set(this.getVariantKey(schemaName, "params"), schemaName);
    this.schemaVariantRefs.set(this.getVariantKey(schemaName, "pathParams"), schemaName);
  }

  /**
   * Find all route files in the project
   */
  findRouteFiles(): string[] {
    if (!this.routeFilesCache) {
      this.routeFilesCache = collectZodRouteFiles(this.apiDir);
    }

    return this.routeFilesCache;
  }

  private getParsedFile(filePath: string, content?: string): t.File {
    const cachedAst = this.fileASTCache.get(filePath);
    if (cachedAst) {
      return cachedAst;
    }

    const source = content ?? this.fileAccess.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(source);
    this.fileASTCache.set(filePath, ast);
    return ast;
  }

  private getSchemaFiles(dir: string): string[] {
    const cachedFiles = this.schemaFilesCache.get(dir);
    if (cachedFiles) {
      return cachedFiles;
    }

    const files: string[] = [];
    processZodSchemaFilesInDirectory(dir, (filePath) => {
      files.push(filePath);
    });
    this.schemaFilesCache.set(dir, files);
    return files;
  }

  /**
   * Recursively find route files in a directory
   */
  findRouteFilesInDir(dir: string, routeFiles: string[]): void {
    try {
      const files = this.fileAccess.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = this.fileAccess.statSync(filePath);

        if (stats.isDirectory()) {
          if (!IGNORED_DIRS.has(file)) {
            this.findRouteFilesInDir(filePath, routeFiles);
          }
        } else if (
          file === "route.ts" ||
          file === "route.tsx" ||
          (file.endsWith(".ts") && file.includes("api"))
        ) {
          routeFiles.push(filePath);
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dir} for route files: ${error}`);
    }
  }

  /**
   * Recursively scan directory for Zod schemas
   */
  scanDirectoryForZodSchema(dir: string, schemaName: string): void {
    this.getSchemaFiles(dir).forEach((filePath) => {
      this.processFileForZodSchema(filePath, schemaName);
    });
  }

  preprocessSchemaDirectories(): void {
    if (!this.hasPreScanned) {
      measurePerformance(this.performanceProfile, "zodPreScanMs", () => {
        this.preScanForTypeMappings();
      });
      this.hasPreScanned = true;
      if (this.runtimeState) {
        this.runtimeState.preScanned = true;
      }
    }

    for (const dir of this.schemaDirs) {
      if (this.runtimeState?.preprocessedSchemaDirectories.has(dir)) {
        continue;
      }

      this.getSchemaFiles(dir).forEach((filePath) => {
        this.preprocessAllSchemasInFile(filePath);
      });
      this.runtimeState?.preprocessedSchemaDirectories.add(dir);
    }
  }

  /**
   * Process a file to find Zod schema definitions
   */
  processFileForZodSchema(filePath: string, schemaName: string): void {
    const visitKey = `${filePath}|${schemaName}|${this.currentContentType}`;
    if (this.processedFileSchemaPairs.has(visitKey)) {
      return;
    }
    this.processedFileSchemaPairs.add(visitKey);

    try {
      const content = this.fileAccess.readFileSync(filePath, "utf-8");

      if (!this.fileMayDefineSchema(filePath, content, schemaName)) {
        return;
      }

      // Pre-process all schemas in file
      this.preprocessAllSchemasInFile(filePath, content);

      // Return it, if the schema has already been processed during pre-processing
      if (this.getStoredSchema(schemaName, this.currentContentType, false)) {
        return;
      }

      const ast = this.getParsedFile(filePath, content);

      // Create a map to store imported modules
      let importedModules: Record<string, string> = {};

      if (this.fileImportsCache.has(filePath)) {
        importedModules = this.fileImportsCache.get(filePath)!;
      } else {
        const resolution = processImports(ast);
        importedModules = resolution.importedModules;
        resolution.drizzleZodImports.forEach((importName) => {
          this.drizzleZodImports.add(importName);
        });
        this.fileImportsCache.set(filePath, importedModules);
        this.zodImportAlias.set(filePath, resolution.zodLocalName);
        if (resolution.zodImportSource) {
          this.zodImportSource.set(filePath, resolution.zodImportSource);
        }
      }

      // Set current processing context for use by processZodNode during factory expansion
      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      // Look for all exported Zod schemas — short-circuit once we have a stored result.
      const shouldSkip = (path: { stop: () => void }): boolean => {
        if (this.getStoredSchema(schemaName, this.currentContentType, false)) {
          path.stop();
          return true;
        }
        return false;
      };
      traverse(ast, {
        // For export const SchemaName = z.object({...})
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
          if (shouldSkip(path)) return;
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration: t.VariableDeclarator) => {
              if (
                t.isIdentifier(declaration.id) &&
                declaration.id.name === schemaName &&
                declaration.init
              ) {
                // Check if this is a drizzle-zod helper function
                if (
                  t.isCallExpression(declaration.init) &&
                  t.isIdentifier(declaration.init.callee) &&
                  this.drizzleZodImports.has(declaration.init.callee.name)
                ) {
                  this.storeResolvedSchema(schemaName, this.processZodNode(declaration.init));
                }
                // Check if this is a call expression with .extend()
                else if (
                  t.isCallExpression(declaration.init) &&
                  t.isMemberExpression(declaration.init.callee) &&
                  t.isIdentifier(declaration.init.callee.property) &&
                  declaration.init.callee.property.name === "extend"
                ) {
                  this.storeResolvedSchema(schemaName, this.processZodNode(declaration.init));
                }
                // Existing code for z.object({...})
                else if (
                  t.isCallExpression(declaration.init) &&
                  t.isMemberExpression(declaration.init.callee) &&
                  t.isIdentifier(declaration.init.callee.object) &&
                  this.isZodLocalName(declaration.init.callee.object.name)
                ) {
                  this.storeResolvedSchema(schemaName, this.processZodNode(declaration.init));
                }
                // Check if this is a factory function call
                else if (
                  t.isCallExpression(declaration.init) &&
                  t.isIdentifier(declaration.init.callee)
                ) {
                  const factoryName = declaration.init.callee.name;
                  logger.debug(
                    `[Schema] Detected potential factory function call: ${factoryName} for schema ${schemaName}`,
                  );

                  const factoryNode = this.findFactoryFunction(
                    factoryName,
                    filePath,
                    ast,
                    importedModules,
                  );

                  if (factoryNode) {
                    logger.debug(`[Schema] Found factory function, attempting to expand...`);
                    const schema = this.expandFactoryCall(factoryNode, declaration.init, filePath);
                    if (schema) {
                      this.storeResolvedSchema(schemaName, schema);
                      logger.debug(
                        `[Schema] Successfully expanded factory function '${factoryName}' for schema '${schemaName}'`,
                      );
                    } else {
                      logger.debug(`[Schema] Failed to expand factory function '${factoryName}'`);
                    }
                  } else {
                    logger.debug(`[Schema] Could not find factory function '${factoryName}'`);
                  }
                }
              }
            });
          }
        },

        // For const SchemaName = z.object({...})
        VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
          if (shouldSkip(path)) return;
          if (t.isIdentifier(path.node.id) && path.node.id.name === schemaName && path.node.init) {
            // Check if this is any Zod schema (including chained calls)
            if (this.isZodSchema(path.node.init)) {
              const schema = this.processZodNode(path.node.init);
              const overrideId = this.extractMetaIdFromNode(path.node.init);
              if (overrideId) {
                this.applyMetaIdOverride(schemaName, schema, overrideId, filePath);
              } else {
                this.storeResolvedSchema(schemaName, schema);
              }
              return;
            }

            this.storeResolvedSchema(schemaName, this.processZodNode(path.node.init));
          }
        },

        // For type aliases that reference Zod schemas
        TSTypeAliasDeclaration: (path: NodePath<t.TSTypeAliasDeclaration>) => {
          if (t.isIdentifier(path.node.id)) {
            const typeName = path.node.id.name;

            if (
              t.isTSTypeReference(path.node.typeAnnotation) &&
              t.isTSQualifiedName(path.node.typeAnnotation.typeName) &&
              t.isIdentifier(path.node.typeAnnotation.typeName.left) &&
              path.node.typeAnnotation.typeName.left.name === "z" &&
              t.isIdentifier(path.node.typeAnnotation.typeName.right) &&
              path.node.typeAnnotation.typeName.right.name === "infer"
            ) {
              // Extract schema name from z.infer<typeof SchemaName>
              if (
                path.node.typeAnnotation.typeParameters &&
                path.node.typeAnnotation.typeParameters.params.length > 0
              ) {
                const param = path.node.typeAnnotation.typeParameters.params[0];
                if (t.isTSTypeQuery(param) && t.isIdentifier(param.exprName)) {
                  const referencedSchemaName = param.exprName.name;

                  // Save mapping: TypeName -> SchemaName
                  this.typeToSchemaMapping[typeName] = referencedSchemaName;
                  logger.debug(`Mapped type '${typeName}' to schema '${referencedSchemaName}'`);

                  // Process the referenced schema if not already processed
                  if (!this.getStoredSchema(referencedSchemaName)) {
                    this.processFileForZodSchema(filePath, referencedSchemaName);
                  }
                }
              }
            }
          }
        },
      });
    } catch (error) {
      logger.error(`Error processing file ${filePath} for schema ${schemaName}: ${error}`);
    }
  }

  /**
   * Process all exported schemas in a file, not just the one we're looking for
   */
  processAllSchemasInFile(filePath: string): void {
    try {
      const content = this.fileAccess.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

      this.currentFilePath = filePath;
      this.currentAST = ast;

      traverse(ast, {
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration: t.VariableDeclarator) => {
              if (
                t.isIdentifier(declaration.id) &&
                declaration.init &&
                t.isCallExpression(declaration.init) &&
                t.isMemberExpression(declaration.init.callee) &&
                t.isIdentifier(declaration.init.callee.object) &&
                this.isZodLocalName(declaration.init.callee.object.name)
              ) {
                const schemaName = declaration.id.name;
                if (!this.getStoredSchema(schemaName) && !this.processingSchemas.has(schemaName)) {
                  this.processingSchemas.add(schemaName);
                  this.storeResolvedSchema(schemaName, this.processZodNode(declaration.init));
                  this.processingSchemas.delete(schemaName);
                }
              } else if (t.isIdentifier(declaration.id) && declaration.init) {
                const schemaName = declaration.id.name;
                const overrideId = this.extractMetaIdFromNode(declaration.init);
                if (
                  overrideId &&
                  !this.getStoredSchema(schemaName) &&
                  !this.processingSchemas.has(schemaName)
                ) {
                  this.processingSchemas.add(schemaName);
                  const schema = this.processZodNode(declaration.init);
                  this.processingSchemas.delete(schemaName);
                  this.applyMetaIdOverride(schemaName, schema, overrideId, filePath);
                }
              }
            });
          }
        },
      });
    } catch (error) {
      logger.error(`Error processing all schemas in file ${filePath}: ${error}`);
    }
  }

  /**
   * Process a Zod node and convert it to OpenAPI schema
   */
  processZodNode(node: t.Node): OpenApiSchema {
    return convertZodNode(this as never, node);
  }

  private warnIfUnknownZodHelper(helperName: string): void {
    if (SUPPORTED_ZOD_HELPERS.has(helperName)) {
      return;
    }

    this.addUnknownZodDiagnostic("unknown-zod-helper", helperName);
  }

  private warnIfUnknownZodMethod(methodName: string): void {
    if (SUPPORTED_ZOD_CHAIN_METHODS.has(methodName)) {
      return;
    }

    this.addUnknownZodDiagnostic("unknown-zod-method", methodName);
  }

  private addUnknownZodDiagnostic(code: "unknown-zod-helper" | "unknown-zod-method", name: string) {
    if (!this.diagnostics) {
      return;
    }

    const key = `${code}:${this.currentFilePath ?? ""}:${name}`;
    if (this.emittedUnknownDiagnostics.has(key)) {
      return;
    }
    this.emittedUnknownDiagnostics.add(key);

    this.diagnostics.add({
      code,
      severity: "warning",
      message:
        code === "unknown-zod-helper"
          ? `Unknown Zod helper "${name}" was approximated as a string schema.`
          : `Unknown Zod chain method "${name}" was ignored during OpenAPI schema conversion.`,
      ...(this.currentFilePath ? { filePath: this.currentFilePath } : {}),
      metadata: { name },
    });
  }

  /**
   * Process a Zod lazy schema: z.lazy(() => Schema)
   */
  processZodLazy(node: t.CallExpression): OpenApiSchema {
    // Get the function in z.lazy(() => Schema)
    if (
      node.arguments.length > 0 &&
      t.isArrowFunctionExpression(node.arguments[0]) &&
      node.arguments[0].body
    ) {
      const returnExpr = node.arguments[0].body;

      // If the function returns an identifier, it's likely a reference to another schema
      if (t.isIdentifier(returnExpr)) {
        const schemaName = returnExpr.name;

        // Create a reference to the schema
        return { $ref: `#/components/schemas/${this.getSchemaReferenceName(schemaName)}` };
      }

      // If the function returns a complex expression, try to process it
      return this.processZodNode(returnExpr);
    }

    return { type: "object" };
  }

  /**
   * Process a Zod literal schema: z.literal("value") (identifier args resolved via SymbolResolver).
   */
  processZodLiteral(node: t.CallExpression): OpenApiSchema {
    return processZodLiteral(node, this.buildPrimitiveHelperContext());
  }

  /**
   * Process a Zod discriminated union: z.discriminatedUnion("type", [schema1, schema2])
   */
  processZodDiscriminatedUnion(node: t.CallExpression): OpenApiSchema {
    return processZodDiscriminatedUnion(
      node,
      (element) => this.processZodNode(element),
      this.buildPrimitiveHelperContext(),
    );
  }

  /**
   * Process a Zod tuple schema: z.tuple([z.string(), z.number()])
   */
  processZodTuple(node: t.CallExpression): OpenApiSchema {
    return processZodTuple(
      node,
      (element) => this.processZodNode(element),
      this.buildPrimitiveHelperContext(),
    );
  }

  /**
   * Process a Zod intersection schema: z.intersection(schema1, schema2)
   */
  processZodIntersection(node: t.CallExpression): OpenApiSchema {
    return processZodIntersection(node, (element) => this.processZodNode(element));
  }

  /**
   * Process a Zod union schema: z.union([schema1, schema2])
   */
  processZodUnion(node: t.CallExpression): OpenApiSchema {
    return processZodUnion(
      node,
      (element) => this.processZodNode(element),
      this.buildPrimitiveHelperContext(),
    );
  }

  /**
   * Build the shared PrimitiveHelperContext used across node-helpers.ts. Kept
   * in one place so the set of identifier resolvers stays in sync.
   */
  private buildPrimitiveHelperContext() {
    return {
      processNode: (currentNode: t.Expression | t.SpreadElement) =>
        this.processZodNode(currentNode),
      processObject: (currentNode: t.CallExpression) => this.processZodObject(currentNode),
      ensureSchema: (schemaName: string) => {
        if (!this.getStoredSchema(schemaName)) {
          this.convertZodSchemaToOpenApi(schemaName);
        }
      },
      getReferenceSchema: (schemaName: string) => ({
        $ref: `#/components/schemas/${this.getSchemaReferenceName(schemaName)}`,
      }),
      resolveEnumValues: (name: string) => this.resolveEnumValues(name),
      resolveLiteralValue: (name: string) => this.resolveLiteralValue(name),
      resolveConstArrayValues: (name: string) => this.resolveConstArrayValues(name),
      resolveObjectSchemaNode: (name: string) => this.resolveObjectSchemaNode(name),
      addDiagnostic: (diagnostic: Diagnostic) => {
        this.diagnostics?.add({
          ...diagnostic,
          ...(this.currentFilePath ? { filePath: this.currentFilePath } : {}),
        });
      },
      zodLocalName: this.currentFilePath
        ? (this.zodImportAlias.get(this.currentFilePath) ?? "z")
        : "z",
    };
  }

  /**
   * Process a Zod object schema: z.object({...}) — with support for an identifier
   * argument (`z.object(shape)` where `shape` is a `const` object declared elsewhere)
   * and `SpreadElement` members (`{ ...Base, id: z.string() }`).
   */
  processZodObject(node: t.CallExpression): OpenApiSchema {
    if (node.arguments.length === 0) {
      return { type: "object" };
    }

    const rawArg = node.arguments[0];
    let objectExpression: t.ObjectExpression | null = null;

    if (t.isObjectExpression(rawArg)) {
      objectExpression = rawArg;
    } else if (t.isIdentifier(rawArg)) {
      // Case 1: identifier refers to another `z.object({...})` call — inline its shape.
      const referenced = this.resolveObjectSchemaNode(rawArg.name);
      if (referenced && t.isCallExpression(referenced) && referenced.arguments.length > 0) {
        const refArg = referenced.arguments[0];
        if (t.isObjectExpression(refArg)) {
          objectExpression = refArg;
        }
      }
      // Case 2: identifier refers to a `const shape = {...}` object literal.
      if (!objectExpression) {
        const constObj = this.resolveConstObjectNode(rawArg.name);
        if (constObj) objectExpression = constObj;
      }
      // Case 3: identifier refers to a schema symbol — emit a $ref.
      if (!objectExpression) {
        this.convertZodSchemaToOpenApi(rawArg.name);
        if (this.getStoredSchema(rawArg.name)) {
          return {
            $ref: `#/components/schemas/${this.getSchemaReferenceName(rawArg.name)}`,
          };
        }
        return { type: "object" };
      }
    }

    if (!objectExpression) {
      return { type: "object" };
    }

    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];

    // Inline spread members (`{ ...BaseShape, id: z.string() }`).
    const inlinedProperties: t.ObjectExpression["properties"] = [];
    for (const prop of objectExpression.properties) {
      if (t.isSpreadElement(prop)) {
        const spreadProps = this.resolveSpreadMembers(prop.argument);
        if (spreadProps) {
          inlinedProperties.push(...spreadProps);
        }
        continue;
      }
      inlinedProperties.push(prop);
    }

    inlinedProperties.forEach((prop, index) => {
      if (t.isObjectProperty(prop)) {
        let propName: string | undefined;

        // Handle identifier, string literal, and statically known computed keys.
        if (t.isIdentifier(prop.key) && !prop.computed) {
          propName = prop.key.name;
        } else if (t.isStringLiteral(prop.key)) {
          propName = prop.key.value;
        } else if (prop.computed && t.isIdentifier(prop.key)) {
          const resolved = this.resolveLiteralValue(prop.key.name);
          if (typeof resolved === "string" || typeof resolved === "number") {
            propName = String(resolved);
          }
        } else {
          logger.debug(`Skipping property ${index} - unsupported key type`);
          this.diagnostics?.add({
            code: "zod-computed-key-skipped",
            severity: "info",
            message:
              "Skipped a Zod object property because its computed key is not statically resolvable.",
            ...(this.currentFilePath ? { filePath: this.currentFilePath } : {}),
            metadata: {
              propertyIndex: index,
              suggestedFix:
                "Use a string literal key or a const string identifier for computed Zod object keys.",
            },
          });
          return; // Skip if key is not identifier or string literal
        }

        if (!propName) {
          return;
        }

        if (
          t.isCallExpression(prop.value) &&
          t.isMemberExpression(prop.value.callee) &&
          t.isIdentifier(prop.value.callee.object) &&
          !this.isZodLocalName(prop.value.callee.object.name)
        ) {
          const schemaName = prop.value.callee.object.name;
          // @ts-ignore
          const methodName = prop.value.callee.property.name;

          // Process base schema first
          if (!this.getStoredSchema(schemaName)) {
            this.convertZodSchemaToOpenApi(schemaName);
          }

          // For describe method, use reference with description
          if (methodName === "describe" && this.getStoredSchema(schemaName)) {
            if (prop.value.arguments.length > 0 && t.isStringLiteral(prop.value.arguments[0])) {
              properties[propName] = {
                allOf: [
                  { $ref: `#/components/schemas/${this.getSchemaReferenceName(schemaName)}` },
                ],
                description: prop.value.arguments[0].value,
              };
            } else {
              properties[propName] = {
                $ref: `#/components/schemas/${this.getSchemaReferenceName(schemaName)}`,
              };
            }
            required.push(propName);
            return;
          }

          // For other methods, process normally
          const processedSchema = this.processZodNode(prop.value);
          if (processedSchema) {
            properties[propName] = processedSchema;
            const isOptional = this.isPropertyOptional(prop.value);
            if (!isOptional) {
              required.push(propName);
            }
          }
          return;
        }

        // Check if the property value is an identifier (reference to another schema)
        if (t.isIdentifier(prop.value)) {
          const referencedSchemaName = prop.value.name;
          // Try to find and convert the referenced schema
          if (!this.getStoredSchema(referencedSchemaName)) {
            this.convertZodSchemaToOpenApi(referencedSchemaName);
          }
          // Create a reference
          properties[propName] = {
            $ref: `#/components/schemas/${this.getSchemaReferenceName(referencedSchemaName)}`,
          };
          const referencedInit = this.resolveObjectSchemaNode(referencedSchemaName);
          if (!referencedInit || !this.isPropertyOptional(referencedInit)) {
            required.push(propName);
          }
          return; // Skip further processing for this property
        }

        // For array of schemas (like z.array(PaymentMethodSchema))
        if (
          t.isCallExpression(prop.value) &&
          t.isMemberExpression(prop.value.callee) &&
          t.isIdentifier(prop.value.callee.object) &&
          this.isZodLocalName(prop.value.callee.object.name) &&
          t.isIdentifier(prop.value.callee.property) &&
          prop.value.callee.property.name === "array" &&
          prop.value.arguments.length > 0 &&
          t.isIdentifier(prop.value.arguments[0])
        ) {
          const itemSchemaName = prop.value.arguments[0].name;
          // Try to find and convert the referenced schema
          if (!this.getStoredSchema(itemSchemaName)) {
            this.convertZodSchemaToOpenApi(itemSchemaName);
          }
          // Process as array with reference
          const arraySchema = this.processZodNode(prop.value);
          arraySchema.items = {
            $ref: `#/components/schemas/${this.getSchemaReferenceName(itemSchemaName)}`,
          };
          properties[propName] = arraySchema;

          const isOptional = this.isPropertyOptional(prop.value);
          if (!isOptional) {
            required.push(propName);
          }
          return; // Skip further processing for this property
        }

        // Process property value (a Zod schema)
        const propSchema = this.processZodNode(prop.value);

        if (propSchema) {
          properties[propName] = propSchema;

          // If the property is not marked as optional, add it to required list
          const isOptional = this.isPropertyOptional(prop.value);

          if (!isOptional) {
            required.push(propName);
          }
        }
      }
    });

    const schema = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      // Deduplicate required array using Set
      // @ts-ignore
      schema.required = [...new Set(required)];
    }

    return schema;
  }

  /**
   * Process a Zod primitive schema: z.string(), z.number(), etc. Identifier-argument
   * resolution (enums, literals, const arrays, object shapes, import aliases) is
   * centralized in {@link ZodSchemaConverter.buildPrimitiveHelperContext}.
   */
  processZodPrimitive(node: t.CallExpression): OpenApiSchema {
    return processZodPrimitiveNode(node, this.buildPrimitiveHelperContext());
  }

  /**
   * Resolve enum values from a TS enum declaration or an `as const` object by identifier name.
   * Searches the current file first, then follows imports and `export * from "..."` via the
   * shared {@link SymbolResolver}.
   */
  private resolveEnumValues(name: string): (string | number)[] | null {
    if (!this.currentFilePath || !this.currentAST) return null;
    this.symbolResolver.primeAST(this.currentFilePath, this.currentAST);
    return this.symbolResolver.resolveEnumValues(this.currentFilePath, name);
  }

  /** Resolve an identifier referring to a mask literal (`{ id: true, name: true }`). */
  private resolveMaskKeys(name: string): string[] | null {
    if (!this.currentFilePath) return null;
    return this.symbolResolver.resolveMaskKeys(this.currentFilePath, name);
  }

  /**
   * Returns true when `name` is the local binding for the `z` import in the
   * currently-processed file, accounting for renames like `import { z as zod }`.
   * Always returns true for the canonical `"z"` — callers should use this
   * instead of comparing to `"z"` directly.
   */
  private isPropertyOptional(node: t.Node): boolean {
    if (!t.isCallExpression(node)) {
      return false;
    }
    return (
      this.isOptional(node) ||
      this.hasOptionalMethod(node) ||
      isOptionalUnionCall(node, this.getCurrentZodLocalName())
    );
  }

  private isZodLocalName(name: string | undefined): boolean {
    if (!name) return false;
    if (name === "z") return true;
    const alias = this.currentFilePath ? this.zodImportAlias.get(this.currentFilePath) : undefined;
    return alias === name;
  }

  /**
   * Extract mask keys from a `.pick(...)`/`.omit(...)` argument node.
   *
   * Accepts object literals (`{ id: true }`), readonly arrays (`["id"] as const`),
   * and identifiers pointing to either. Identifier resolution goes through the
   * shared `SymbolResolver` cache.
   */
  private extractMaskKeysFromNode(arg: t.Node | t.SpreadElement | undefined): string[] {
    if (!arg || t.isSpreadElement(arg)) return [];
    if (t.isTSAsExpression(arg) || t.isTSSatisfiesExpression(arg)) {
      return this.extractMaskKeysFromNode(arg.expression);
    }
    if (t.isObjectExpression(arg)) {
      const keys: string[] = [];
      for (const prop of arg.properties) {
        if (t.isObjectProperty(prop) && t.isBooleanLiteral(prop.value) && prop.value.value) {
          if (t.isIdentifier(prop.key)) keys.push(prop.key.name);
          else if (t.isStringLiteral(prop.key)) keys.push(prop.key.value);
        }
      }
      return keys;
    }
    if (t.isArrayExpression(arg)) {
      const keys: string[] = [];
      for (const element of arg.elements) {
        if (element && t.isStringLiteral(element)) keys.push(element.value);
      }
      return keys;
    }
    if (t.isIdentifier(arg)) {
      const resolved = this.resolveMaskKeys(arg.name);
      if (resolved && resolved.length > 0) return resolved;
      const arrayValues = this.resolveConstArrayValues(arg.name);
      if (arrayValues) {
        return arrayValues.filter((value): value is string => typeof value === "string");
      }
    }
    return [];
  }

  /** Resolve an identifier referring to a `const` object literal. */
  private resolveConstObjectNode(name: string): t.ObjectExpression | null {
    if (!this.currentFilePath) return null;
    if (this.currentAST) this.symbolResolver.primeAST(this.currentFilePath, this.currentAST);
    return this.symbolResolver.resolveConstObject(this.currentFilePath, name);
  }

  /** Resolve an identifier referring to a `const` array literal. */
  private resolveConstArrayValues(name: string): (string | number)[] | null {
    if (!this.currentFilePath) return null;
    if (this.currentAST) this.symbolResolver.primeAST(this.currentFilePath, this.currentAST);
    return this.symbolResolver.resolveConstArrayValues(this.currentFilePath, name);
  }

  /** Resolve a literal value for a `const x = "foo" | 42 | true | null`. */
  private resolveLiteralValue(name: string): string | number | boolean | null | undefined {
    if (!this.currentFilePath) return undefined;
    if (this.currentAST) this.symbolResolver.primeAST(this.currentFilePath, this.currentAST);
    return this.symbolResolver.resolveLiteral(this.currentFilePath, name);
  }

  /**
   * Unwrap a possible `TSAsExpression` / `TSSatisfiesExpression` to get the
   * underlying expression node.  Returns the node itself when no wrapper is
   * present.
   */
  private unwrapTypeAssertion(node: t.Node | null | undefined): t.Node | undefined {
    if (!node) return undefined;
    if (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node)) {
      return node.expression;
    }
    return node;
  }

  /**
   * Resolve a numeric value from a call-expression argument.
   * Handles: numeric literals, identifier references to const numbers,
   * and `x as number` / `x satisfies number` wrappers around either.
   */
  private resolveNumericArg(arg: t.Node | null | undefined): number | undefined {
    if (!arg) return undefined;
    const node = this.unwrapTypeAssertion(arg);
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument)) {
      return -node.argument.value;
    }
    if (t.isIdentifier(node)) {
      const val = this.resolveLiteralValue(node.name);
      if (typeof val === "number") return val;
    }
    return undefined;
  }

  /**
   * Resolve a string value from a call-expression argument.
   * Handles: string literals, identifier references to const strings,
   * and `x as string` / `x satisfies string` wrappers around either.
   */
  private resolveStringArg(arg: t.Node | null | undefined): string | undefined {
    if (!arg) return undefined;
    const node = this.unwrapTypeAssertion(arg);
    if (t.isStringLiteral(node)) return node.value;
    if (t.isIdentifier(node)) {
      const val = this.resolveLiteralValue(node.name);
      if (typeof val === "string") return val;
    }
    return undefined;
  }

  private resolveStringArrayArg(arg: t.Node | null | undefined): string[] | undefined {
    if (!arg) return undefined;
    const node = this.unwrapTypeAssertion(arg);
    if (t.isStringLiteral(node)) return [node.value];
    if (t.isArrayExpression(node)) {
      const values = node.elements.flatMap((element) => {
        const value = this.resolveStringArg(element);
        return value === undefined ? [] : [value];
      });
      return values.length > 0 ? values : undefined;
    }
    if (t.isIdentifier(node)) {
      const literal = this.resolveLiteralValue(node.name);
      if (typeof literal === "string") return [literal];

      const values = this.resolveConstArrayValues(node.name);
      if (values && values.every((value) => typeof value === "string")) {
        return values;
      }
    }
    return undefined;
  }

  /**
   * Resolve an identifier referring to a `z.object({...})` (or similar) call expression.
   * This lets callers inline the referenced object's shape.
   */
  private resolveObjectSchemaNode(name: string): t.CallExpression | null {
    if (!this.currentFilePath) return null;
    if (this.currentAST) this.symbolResolver.primeAST(this.currentFilePath, this.currentAST);
    const decl = this.symbolResolver.resolveDeclaration(this.currentFilePath, name);
    if (!decl) return null;
    const node = decl.node;
    if (t.isVariableDeclarator(node) && node.init && t.isCallExpression(node.init)) {
      return node.init;
    }
    if (t.isCallExpression(node)) return node;
    return null;
  }

  /**
   * Resolve a spread argument (`...X`) inside a `z.object({...})` shape to the
   * concrete list of object-literal properties. Supports:
   *   - `...BaseShape` where `BaseShape` is a `const` object literal.
   *   - `...Base.shape` where `Base` is a `z.object({...})` call (Zod 3/4 API).
   * Returns `null` when the spread cannot be resolved statically.
   */
  private resolveSpreadMembers(argument: t.Expression): t.ObjectExpression["properties"] | null {
    // `{ ...BaseShape }` — identifier to a const object literal.
    if (t.isIdentifier(argument)) {
      const constObj = this.resolveConstObjectNode(argument.name);
      if (constObj) return constObj.properties;
      const schemaNode = this.resolveObjectSchemaNode(argument.name);
      if (
        schemaNode &&
        schemaNode.arguments.length > 0 &&
        t.isObjectExpression(schemaNode.arguments[0])
      ) {
        return schemaNode.arguments[0].properties;
      }
      return null;
    }

    // `{ ...Base.shape }` — property access on a z.object() identifier.
    if (
      t.isMemberExpression(argument) &&
      !argument.computed &&
      t.isIdentifier(argument.property) &&
      argument.property.name === "shape" &&
      t.isIdentifier(argument.object)
    ) {
      const schemaNode = this.resolveObjectSchemaNode(argument.object.name);
      if (
        schemaNode &&
        schemaNode.arguments.length > 0 &&
        t.isObjectExpression(schemaNode.arguments[0])
      ) {
        return schemaNode.arguments[0].properties;
      }
    }

    return null;
  }

  /**
   * Extract description from method arguments if it's a .describe() call
   */
  extractDescriptionFromArguments(node: t.CallExpression): string | null {
    return extractDescriptionFromArguments(node);
  }

  extractStaticJsonValue(node: t.Node | null | undefined): unknown {
    if (!node) {
      return undefined;
    }

    if (t.isStringLiteral(node)) {
      return node.value;
    }
    if (t.isNumericLiteral(node)) {
      return node.value;
    }
    if (t.isBooleanLiteral(node)) {
      return node.value;
    }
    if (t.isNullLiteral(node)) {
      return null;
    }
    if (t.isIdentifier(node)) {
      const val = this.resolveLiteralValue(node.name);
      if (val !== undefined) return val;
    }
    if (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node)) {
      return this.extractStaticJsonValue(node.expression);
    }
    if (t.isArrayExpression(node)) {
      const values: unknown[] = [];
      for (const element of node.elements) {
        if (!element || t.isSpreadElement(element)) {
          return undefined;
        }
        const value = this.extractStaticJsonValue(element);
        if (typeof value === "undefined") {
          return undefined;
        }
        values.push(value);
      }
      return values;
    }
    if (t.isObjectExpression(node)) {
      const value: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (!t.isObjectProperty(property)) {
          return undefined;
        }
        const key = t.isIdentifier(property.key)
          ? property.key.name
          : t.isStringLiteral(property.key)
            ? property.key.value
            : null;
        if (!key) {
          return undefined;
        }
        const propertyValue = this.extractStaticJsonValue(property.value);
        if (typeof propertyValue === "undefined") {
          return undefined;
        }
        value[key] = propertyValue;
      }
      return value;
    }

    return undefined;
  }

  private extractMetaIdFromNode(node: t.Node): string | null {
    if (!t.isCallExpression(node)) return null;
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      if (node.callee.property.name === "meta" && node.arguments.length > 0) {
        const metadata = this.extractStaticJsonValue(node.arguments[0]);
        if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
          const id = (metadata as Record<string, unknown>).id;
          if (typeof id === "string" && id.length > 0) return id;
        }
      }
      if (t.isCallExpression(node.callee.object)) {
        return this.extractMetaIdFromNode(node.callee.object);
      }
    }
    return null;
  }

  private shouldUseRuntimeExport(node: t.Node): boolean {
    if (!t.isCallExpression(node)) {
      return false;
    }

    const zodLocalName = this.getCurrentZodLocalName();
    const helperPath = getZodRuntimeHelperPath(node, zodLocalName);
    if (helperPath) {
      const helperName = helperPath.join(".");
      return (
        helperName.startsWith("coerce.") ||
        helperName === "templateLiteral" ||
        helperName === "stringbool" ||
        helperName === "prefault"
      );
    }

    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      if (node.callee.property.name === "pipe") {
        return true;
      }

      if (t.isCallExpression(node.callee.object)) {
        return this.shouldUseRuntimeExport(node.callee.object);
      }
    }

    return false;
  }

  /**
   * Process a Zod chained method call: z.string().email().min(5)
   */
  processZodChain(node: t.CallExpression): OpenApiSchema {
    if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
      return { type: "object" };
    }

    const methodName = node.callee.property.name;

    // Process the parent chain first
    let schema = this.processZodNode(node.callee.object);

    schema = this.applyZodChainMethod(schema, methodName, node);
    this.reconcileNumericBounds(schema);
    return schema;
  }

  private applyZodChainMethod(
    schema: OpenApiSchema,
    methodName: string,
    node: t.CallExpression,
  ): OpenApiSchema {
    return applyZodChainMethodValue(this as never, schema, methodName, node);
  }

  private applyFunctionalCheckArg(schema: OpenApiSchema, arg: t.CallExpression): OpenApiSchema {
    if (!t.isMemberExpression(arg.callee) || !t.isIdentifier(arg.callee.property)) {
      return schema;
    }

    if (!t.isIdentifier(arg.callee.object) || !this.isZodLocalName(arg.callee.object.name)) {
      return schema;
    }

    const fnName = arg.callee.property.name;
    if (fnName === "refine" || fnName === "check" || fnName === "superRefine") {
      return schema;
    }

    if (FUNCTIONAL_NOOP_CHECKS.has(fnName)) {
      return schema;
    }

    const chainMethod = FUNCTIONAL_CHECK_TO_CHAIN_METHOD[fnName] ?? fnName;
    if (FUNCTIONAL_FORMAT_CHECKS.has(fnName) || SUPPORTED_ZOD_CHAIN_METHODS.has(chainMethod)) {
      return this.applyZodChainMethod(schema, chainMethod, arg);
    }

    return schema;
  }

  private processZodFunctionalWrapper(methodName: string, node: t.CallExpression): OpenApiSchema {
    if (methodName === "extend") {
      const baseArg = node.arguments[0];
      const shapeArg = node.arguments[1];
      if (
        !baseArg ||
        !shapeArg ||
        t.isArgumentPlaceholder(baseArg) ||
        t.isArgumentPlaceholder(shapeArg)
      ) {
        return { type: "object" };
      }
      return this.mergeExtendedObject(this.processZodNode(baseArg), shapeArg);
    }

    const innerArg = node.arguments[0];
    if (!innerArg || t.isArgumentPlaceholder(innerArg)) {
      return { type: "object" };
    }

    let schema = this.processZodNode(innerArg);

    switch (methodName) {
      case "readonly":
        schema.readOnly = true;
        return schema;
      case "describe": {
        const descVal = this.resolveStringArg(node.arguments[1]);
        if (descVal !== undefined) {
          if (descVal.startsWith("@deprecated")) {
            schema.deprecated = true;
            schema.description = descVal.replace("@deprecated", "").trim();
          } else {
            schema.description = descVal;
          }
        }
        return schema;
      }
      case "default": {
        const valueArg = node.arguments[1];
        if (!valueArg || t.isArgumentPlaceholder(valueArg)) {
          return schema;
        }
        const syntheticNode = t.callExpression(
          t.memberExpression(t.identifier("_"), t.identifier("default")),
          [valueArg],
        );
        return this.applyZodChainMethod(schema, "default", syntheticNode);
      }
      case "prefault":
      case "catch": {
        const valueArg = node.arguments[1];
        if (!valueArg || t.isArgumentPlaceholder(valueArg)) {
          return schema;
        }
        const syntheticNode = t.callExpression(
          t.memberExpression(t.identifier("_"), t.identifier(methodName)),
          [valueArg],
        );
        return this.applyZodChainMethod(schema, methodName, syntheticNode);
      }
      default:
        return schema;
    }
  }

  private mergeExtendedObject(
    baseSchemaResult: OpenApiSchema,
    shapeArg: t.Node | t.SpreadElement | t.ArgumentPlaceholder,
  ): OpenApiSchema {
    if (!t.isObjectExpression(shapeArg)) {
      return baseSchemaResult;
    }

    let baseSchema = baseSchemaResult;
    if (baseSchemaResult.$ref) {
      const schemaName = baseSchemaResult.$ref.replace("#/components/schemas/", "");
      if (!this.getStoredSchema(schemaName)) {
        logger.debug(`[extend] Base schema ${schemaName} not found, attempting to convert it`);
        this.convertZodSchemaToOpenApi(schemaName);
      }
      if (this.getStoredSchema(schemaName)) {
        baseSchema = this.getStoredSchema(schemaName)!;
      } else {
        logger.debug(`Could not resolve reference for extend: ${schemaName}`);
      }
    }

    const extendNode = t.callExpression(
      t.memberExpression(t.identifier(this.getCurrentZodLocalName()), t.identifier("object")),
      [shapeArg],
    );
    const extendedProps = this.processZodObject(extendNode);

    if (baseSchema.properties) {
      const merged: OpenApiSchema = {
        type: "object",
        properties: {
          ...baseSchema.properties,
          ...extendedProps?.properties,
        },
        required: [...(baseSchema.required || []), ...(extendedProps?.required || [])].filter(
          (item, index, arr) => arr.indexOf(item) === index,
        ),
      };
      if (baseSchema.description) {
        merged.description = baseSchema.description;
      }
      return merged;
    }

    return extendedProps || { type: "object" };
  }

  private reconcileNumericBounds(schema: OpenApiSchema): void {
    if (typeof schema.minimum === "number" && typeof schema.exclusiveMinimum === "number") {
      if (schema.exclusiveMinimum >= schema.minimum) {
        delete schema.minimum;
      } else {
        delete schema.exclusiveMinimum;
      }
    }

    if (typeof schema.maximum === "number" && typeof schema.exclusiveMaximum === "number") {
      if (schema.exclusiveMaximum <= schema.maximum) {
        delete schema.maximum;
      } else {
        delete schema.exclusiveMaximum;
      }
    }
  }

  /** Recursively clear `required` arrays on nested object schemas. */
  private applyDeepPartial(schema: OpenApiSchema): void {
    if (!schema || typeof schema !== "object") return;
    if (schema.type === "object" && schema.properties) {
      delete schema.required;
      for (const key of Object.keys(schema.properties)) {
        const child = schema.properties[key];
        if (child) this.applyDeepPartial(child);
      }
    }
    if (schema.items) this.applyDeepPartial(schema.items as OpenApiSchema);
    if (Array.isArray(schema.allOf)) schema.allOf.forEach((s) => this.applyDeepPartial(s));
    if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((s) => this.applyDeepPartial(s));
    if (Array.isArray(schema.oneOf)) schema.oneOf.forEach((s) => this.applyDeepPartial(s));
  }

  /**
   * Helper to escape special regex characters for pattern creation
   */
  private escapeRegExp(string: string): string {
    return escapeRegExp(string);
  }

  private mergePipeSchema(baseSchema: OpenApiSchema, pipedSchema: OpenApiSchema): OpenApiSchema {
    if (pipedSchema.$ref || pipedSchema.allOf || pipedSchema.anyOf || pipedSchema.oneOf) {
      return pipedSchema;
    }

    return {
      ...baseSchema,
      ...pipedSchema,
    };
  }

  /**
   * Check if a Zod schema is optional
   */
  isOptional(node: t.CallExpression): boolean {
    return isOptionalCall(node, this.getCurrentZodLocalName());
  }

  /**
   * Check if a node has .optional() in its method chain
   */
  hasOptionalMethod(node: t.CallExpression): boolean {
    return hasOptionalMethod(node, this.getCurrentZodLocalName());
  }

  private getCurrentZodLocalName(): string {
    return this.currentFilePath ? (this.zodImportAlias.get(this.currentFilePath) ?? "z") : "z";
  }

  /**
   * Get all processed Zod schemas
   */
  getProcessedSchemas(): Record<string, OpenApiSchema> {
    const result: Record<string, OpenApiSchema> = {};
    for (const [name, schema] of Object.entries(this.zodSchemas)) {
      if (!this.internalSchemaNames.has(name)) {
        result[name] = schema;
      }
    }
    return result;
  }

  /**
   * Pre-scan all files to build type mappings
   */
  preScanForTypeMappings(): void {
    logger.debug("Pre-scanning for type mappings...");

    // Scan route files
    const routeFiles = this.findRouteFiles();
    for (const routeFile of routeFiles) {
      this.scanFileForTypeMappings(routeFile);
    }

    // Scan schema directories
    for (const dir of this.schemaDirs) {
      this.getSchemaFiles(dir).forEach((filePath) => {
        this.scanFileForTypeMappings(filePath);
        this.indexSchemaNamesInFile(filePath);
      });
    }
  }

  /**
   * Scan a single file for type mappings
   */
  scanFileForTypeMappings(filePath: string): void {
    try {
      const ast = this.getParsedFile(filePath);
      Object.assign(this.typeToSchemaMapping, extractTypeMappingsFromAST(ast));
    } catch (error) {
      logger.error(`Error scanning file ${filePath} for type mappings: ${error}`);
    }
  }

  private indexSchemaNamesInFile(filePath: string): void {
    try {
      const ast = this.getParsedFile(filePath);
      const { importedModules, drizzleZodImports, zodLocalName, zodImportSource } =
        collectImportMetadata(ast);
      drizzleZodImports.forEach((importName) => {
        this.drizzleZodImports.add(importName);
      });
      this.fileImportsCache.set(filePath, importedModules);
      this.zodImportAlias.set(filePath, zodLocalName);
      if (zodImportSource) {
        this.zodImportSource.set(filePath, zodImportSource);
      }

      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      traverse(ast, {
        VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
          if (t.isIdentifier(path.node.id) && path.node.init && this.isZodSchema(path.node.init)) {
            this.indexSchemaName(path.node.id.name, filePath);
          }
        },
      });
    } catch (error) {
      logger.error(`Error indexing Zod schemas in file ${filePath}: ${error}`);
    }
  }

  /**
   * Pre-process all Zod schemas in a file
   */
  preprocessAllSchemasInFile(filePath: string, content?: string): void {
    if (this.preprocessedFiles.has(filePath)) {
      return;
    }

    measurePerformance(this.performanceProfile, "zodPreprocessMs", () => {
      try {
        const ast = this.getParsedFile(filePath, content);

        const { importedModules, drizzleZodImports, zodLocalName, zodImportSource } =
          collectImportMetadata(ast);
        drizzleZodImports.forEach((importName) => {
          this.drizzleZodImports.add(importName);
        });

        // Cache imports + alias for this file
        this.fileImportsCache.set(filePath, importedModules);
        this.zodImportAlias.set(filePath, zodLocalName);
        if (zodImportSource) {
          this.zodImportSource.set(filePath, zodImportSource);
        }

        // Set current processing context for factory function expansion
        this.currentFilePath = filePath;
        this.currentAST = ast;
        this.currentImports = importedModules;

        // Mark file as preprocessed BEFORE traversal so recursive lookups (e.g. when
        // resolving cross-references like `SafeRedirectPathSchema.optional()` inside
        // another schema in the same file) don't re-enter preprocessing on a half-built
        // state and emit spurious "conflicts with an existing schema" warnings.
        this.preprocessedFiles.add(filePath);

        // Collect all exported Zod schemas
        traverse(ast, {
          ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
            if (t.isVariableDeclaration(path.node.declaration)) {
              path.node.declaration.declarations.forEach((declaration: t.VariableDeclarator) => {
                if (t.isIdentifier(declaration.id) && declaration.init) {
                  const schemaName = declaration.id.name;

                  // Check if is Zod schema
                  if (this.isZodSchema(declaration.init)) {
                    const decl = path.node.declaration;
                    const allComments = [
                      ...(path.node.leadingComments ?? []),
                      ...(decl?.leadingComments ?? []),
                      ...(declaration.leadingComments ?? []),
                    ];
                    if (extractInternalFlagFromComments(allComments)) {
                      this.internalSchemaNames.add(schemaName);
                    }
                    if (!this.getStoredSchema(schemaName)) {
                      logger.debug(`Pre-processing Zod schema: ${schemaName}`);
                      this.processingSchemas.add(schemaName);
                      // Restore context in case a recursive preprocessAllSchemasInFile call
                      // (triggered by processZodNode resolving an import) overwrote these fields.
                      this.currentFilePath = filePath;
                      this.currentAST = ast;
                      this.currentImports = importedModules;
                      const schema = this.processZodNode(declaration.init);
                      this.processingSchemas.delete(schemaName);
                      if (schema) {
                        const overrideId = this.extractMetaIdFromNode(declaration.init);
                        this.applyMetaIdOverride(schemaName, schema, overrideId, filePath);
                      } else {
                        this.indexSchemaName(schemaName, filePath);
                      }
                    } else {
                      this.indexSchemaName(schemaName, filePath);
                    }
                  }
                }
              });
            }
          },
          // Also process non-exported const declarations
          VariableDeclaration: (path: NodePath<t.VariableDeclaration>) => {
            path.node.declarations.forEach((declaration: t.VariableDeclarator) => {
              if (t.isIdentifier(declaration.id) && declaration.init) {
                const schemaName = declaration.id.name;
                if (this.isZodSchema(declaration.init)) {
                  const allComments = [
                    ...(path.node.leadingComments ?? []),
                    ...(declaration.leadingComments ?? []),
                  ];
                  if (extractInternalFlagFromComments(allComments)) {
                    this.internalSchemaNames.add(schemaName);
                  }
                  if (
                    !this.getStoredSchema(schemaName) &&
                    !this.processingSchemas.has(schemaName)
                  ) {
                    logger.debug(`Pre-processing Zod schema: ${schemaName}`);
                    this.processingSchemas.add(schemaName);
                    // Restore context in case a recursive preprocessAllSchemasInFile call
                    // (triggered by processZodNode resolving an import) overwrote these fields.
                    this.currentFilePath = filePath;
                    this.currentAST = ast;
                    this.currentImports = importedModules;
                    const schema = this.processZodNode(declaration.init);
                    this.processingSchemas.delete(schemaName);
                    if (schema) {
                      const overrideId = this.extractMetaIdFromNode(declaration.init);
                      this.applyMetaIdOverride(schemaName, schema, overrideId, filePath);
                    } else {
                      this.indexSchemaName(schemaName, filePath);
                    }
                  } else {
                    this.indexSchemaName(schemaName, filePath);
                  }
                }
              }
            });
          },
        });
      } catch (error) {
        logger.error(`Error pre-processing file ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Register the reverse lookup `schemaName -> filePath` so subsequent
   * `convertZodSchemaToOpenApi` calls can skip the directory scan when the name
   * was already seen.
   */
  private indexSchemaName(schemaName: string, filePath: string): void {
    let bucket = this.schemaNameToFiles.get(schemaName);
    if (!bucket) {
      bucket = new Set();
      this.schemaNameToFiles.set(schemaName, bucket);
    }
    bucket.add(filePath);
  }

  private applyMetaIdOverride(
    schemaName: string,
    schema: OpenApiSchema,
    overrideId: string | null,
    filePath: string,
  ): void {
    const finalName = overrideId && overrideId !== schemaName ? overrideId : schemaName;
    const schemaUsesRuntimeExport = this.currentSchemaUsedRuntimeExport;
    this.currentSchemaUsedRuntimeExport = false;
    if (schemaUsesRuntimeExport) {
      this.variantSensitiveSchemaNames.add(finalName);
    }
    this.indexSchemaName(schemaName, filePath);
    if (finalName !== schemaName) {
      this.indexSchemaName(finalName, filePath);
    }
    if (!this.zodSchemas[finalName]) {
      if (overrideId && overrideId !== schemaName) {
        this.typeToSchemaMapping[schemaName] = overrideId;
        this.metaIdSchemaNames.add(schemaName);
        // Remove any reverse mapping that would create a cycle (e.g. from z.infer<typeof X> type aliases)
        if (this.typeToSchemaMapping[overrideId] === schemaName) {
          delete this.typeToSchemaMapping[overrideId];
        }
      }
      // Store directly under finalName, bypassing storeResolvedSchema's typeToSchemaMapping
      // lookup which might contain a reverse-mapping for finalName (from z.infer<> type aliases).
      const variantKey = this.getVariantKey(finalName, this.currentContentType);
      this.zodSchemas[finalName] = schema;
      this.schemaVariantRefs.set(variantKey, finalName);
      if (!this.variantSensitiveSchemaNames.has(finalName)) {
        this.registerCommonVariantRefs(finalName);
      }
    } else {
      logger.warn(
        `Schema component name '${overrideId ?? finalName}' conflicts with an existing schema, ignoring .meta({ id }) on '${schemaName}'`,
      );
    }
  }

  /**
   * Derives the conventional Zod schema name from a TypeScript type name.
   * e.g. "Slider" → "sliderSchema", "SliderItem" → "sliderItemSchema".
   * Returns null when the input is already a schema name or is not PascalCase.
   */
  private deriveSchemaNameByConvention(typeName: string): string | null {
    if (!typeName || !/^[A-Z]/.test(typeName) || typeName.endsWith("Schema")) {
      return null;
    }
    return typeName[0]!.toLowerCase() + typeName.slice(1) + "Schema";
  }

  /**
   * Checks whether a Zod schema with the given name is present in schemaDirs
   * WITHOUT populating the processed-schema cache. A file-content substring check
   * (the same heuristic used by processFileForZodSchema) is sufficient here: we
   * only want to know whether the candidate *might* live in schemaDirs so that the
   * convention mapping can be registered; the actual processing happens later in
   * the normal convertZodSchemaToOpenApi lookup flow.
   */
  private locateSchemaByConvention(candidate: string): boolean {
    if (this.schemaNameToFiles.has(candidate)) {
      return true;
    }
    return false;
  }

  private fileMayDefineSchema(filePath: string, content: string, schemaName: string): boolean {
    if (!content.includes(schemaName)) {
      return false;
    }
    if (this.isSchemaFilePath(filePath)) {
      return true;
    }

    const escapedName = escapeRegExp(schemaName);
    return new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var|type|interface)\\s+${escapedName}\\b`,
    ).test(content);
  }

  private isSchemaFilePath(filePath: string): boolean {
    return this.schemaDirs.some((dir) => {
      const relativePath = path.relative(dir, filePath);
      return (
        relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
      );
    });
  }

  /**
   * Check if node is Zod schema
   */
  isZodSchema(node: t.Node): boolean {
    const alias = this.currentFilePath ? this.zodImportAlias.get(this.currentFilePath) : undefined;
    return isZodSchemaNode(node, this.drizzleZodImports, alias ?? "z");
  }

  /**
   * Find a factory function by name (lazy detection with caching)
   * @param functionName - Name of the function to find
   * @param currentFilePath - Path of the current file being processed
   * @param currentAST - Already parsed AST of current file
   * @param importedModules - Map of imported module names to their sources
   * @returns Factory function node if found and returns Zod schema, null otherwise
   */
  findFactoryFunction(
    functionName: string,
    currentFilePath: string,
    currentAST: t.File,
    importedModules: Record<string, string>,
  ): t.Node | null {
    return findFactoryFunctionNode({
      functionName,
      currentFilePath,
      currentAST,
      importedModules,
      factoryCache: this.factoryCache,
      factoryCheckCache: this.factoryCheckCache,
      fileAccess: this.fileAccess,
      resolveImportPath: (filePath, importSource) => this.resolveImportPath(filePath, importSource),
      parseFileWithCache: (filePath) => this.parseFileWithCache(filePath),
      isZodSchema: (node) => this.isZodSchema(node),
    });
  }

  /**
   * Check if a function returns a Zod schema by analyzing return statements
   */
  returnsZodSchema(functionNode: t.Node): boolean {
    return returnsZodSchemaNode(functionNode, (node) => this.isZodSchema(node));
  }

  /**
   * Parse a file with caching (also caches imports). Routes through the shared
   * {@link SymbolResolver} so the AST is cached once across both the Zod and TS paths.
   */
  parseFileWithCache(filePath: string): t.File | null {
    // Delegate to the existing helper so we also keep drizzleZodImports / fileImportsCache
    // populated for legacy callers; the AST is shared via fileASTCache (which the resolver
    // references by identity).
    return parseFileWithCache(
      filePath,
      this.fileAccess,
      this.fileASTCache,
      this.fileImportsCache,
      this.drizzleZodImports,
    );
  }

  /**
   * Resolve import path relative to current file. Uses the shared resolver's memoized
   * path cache so repeated lookups are O(1).
   */
  resolveImportPath(currentFilePath: string, importSource: string): string | null {
    return this.symbolResolver.resolveImportPath(currentFilePath, importSource);
  }

  /**
   * Expand a factory function call by substituting arguments
   */
  expandFactoryCall(
    factoryNode: t.Node,
    callNode: t.CallExpression,
    _filePath: string,
  ): OpenApiSchema | null {
    return expandFactoryCall(factoryNode, callNode, (node) => this.processZodNode(node));
  }

  /**
   * Extract the return node from a function
   */
  extractReturnNode(functionNode: t.Node): t.Node | null {
    return extractReturnNode(functionNode);
  }

  /**
   * Substitute parameters with actual arguments in an AST node (deep clone and replace)
   */
  substituteParameters(node: t.Node, paramMap: Map<string, t.Node>, _filePath: string): t.Node {
    return substituteParameters(node, paramMap);
  }
}

function areSchemasEquivalent(left: OpenApiSchema, right: OpenApiSchema): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getZodRuntimeHelperPath(
  node: t.CallExpression,
  zodLocalName: string = "z",
): string[] | null {
  if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return null;
  }

  const path = [node.callee.property.name];
  let currentObject: t.Node = node.callee.object;

  while (t.isMemberExpression(currentObject)) {
    if (!t.isIdentifier(currentObject.property)) {
      return null;
    }
    path.unshift(currentObject.property.name);
    currentObject = currentObject.object;
  }

  if (!t.isIdentifier(currentObject)) {
    return null;
  }

  return currentObject.name === "z" || currentObject.name === zodLocalName ? path : null;
}
