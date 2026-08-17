import fs from "fs";
import path from "path";

import * as t from "@babel/types";
import type * as ts from "typescript";

import type { GenerationPerformanceProfile } from "../../core/performance.js";
import type { SharedGenerationRuntime } from "../../core/runtime.js";
import type { DiagnosticsCollector } from "../../diagnostics/collector.js";
import { traverse } from "../../shared/babel-traverse.js";
import { logger } from "../../shared/logger.js";
import { parseTypeScriptFile } from "../../shared/parse-typescript.js";
import { SymbolResolver } from "../../shared/symbol-resolver.js";
import type {
  ContentType,
  OpenAPIDefinition,
  OpenApiExampleMap,
  OpenApiSchemaLike,
  ParamSchema,
  SchemaType,
} from "../../shared/types.js";
import { isDateType } from "../../shared/typescript-adapter.js";
import { getTypeScriptAdapter, getTypeScriptProject } from "../../shared/typescript-project.js";
import type { TypeScriptRuntime } from "../../shared/typescript-runtime.js";
import { processCustomSchemaFiles } from "../core/custom-schema-file-processor.js";
import { CustomSchemaProcessor } from "../core/custom-schema-processor.js";
import { mergeSchemaDefinitionLayers } from "../core/schema-definition-processor.js";
import { ZodSchemaConverter } from "../zod/zod-converter.js";
import { ZodSchemaProcessor } from "../zod/zod-schema-processor.js";
import {
  resolveGenericTypeFromString as resolveGenericTypeFromStringValue,
  resolveGenericType as resolveGenericTypeValue,
  resolveTypeWithSubstitution as resolveTypeWithSubstitutionValue,
} from "./generic-types.js";
import {
  createTypeReferenceFromString,
  detectContentType,
  extractKeysFromLiteralType,
  getExampleForParam,
  getPropertyOptions,
  getSchemaProcessorErrorMessage,
  normalizeSchemaDirs,
  normalizeSchemaTypes,
  parseGenericTypeString,
  splitGenericTypeArguments,
} from "./helpers.js";
import {
  createDefaultPathParamsSchema,
  createMultipleResponsesSchema,
  createRequestBodySchema,
  createRequestParamsSchema,
  createResponseSchema,
  getSchemaContent,
} from "./schema-content.js";
import {
  collectAllExportedDefinitions,
  collectImports,
  collectTopLevelDefinitionNames,
  collectTypeDefinitions,
  resolveImportPath,
} from "./schema-discovery.js";
import { applyPropertyOpenApiOverride, resolveTypeNodeSchema } from "./type-node-schema.js";

type SchemaProcessorFileAccess = Pick<
  typeof fs,
  "existsSync" | "readdirSync" | "statSync" | "readFileSync"
>;

const defaultFileAccess: SchemaProcessorFileAccess = fs;
export { createTypeReferenceFromString, parseGenericTypeString, splitGenericTypeArguments };

export class SchemaProcessor {
  private sharedRuntime: SharedGenerationRuntime | undefined;
  private schemaDirs: string[];
  private typeDefinitions: Record<string, any> = {};
  private openapiDefinitions: Record<string, OpenAPIDefinition> = {};
  private contentType: ContentType = "";
  private customSchemaProcessor: CustomSchemaProcessor;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processSchemaTracker: Record<string, boolean> = {};
  private schemaFiles: string[] | null = null;
  private schemaDefinitionIndex: Record<string, string[]> = {};
  private fileASTCache: Map<string, t.File> = new Map();
  private processingTypes: Set<string> = new Set();
  private inlineTypeCache: Map<string, OpenAPIDefinition> = new Map();
  private schemaContentCache: Map<string, ReturnType<typeof getSchemaContent>> = new Map();
  private resolvedSchemaCache: Set<string> = new Set();

  private zodSchemaConverter: ZodSchemaConverter | null = null;
  private zodSchemaProcessor: ZodSchemaProcessor | null = null;
  private schemaTypes: SchemaType[];
  private isResolvingPickOmitBase: boolean = false;
  private schemaIdAliases: Record<string, string> = {};
  private internalSchemaNames: Set<string> = new Set();
  private readonly fileAccess: SchemaProcessorFileAccess;
  private readonly symbolResolver: SymbolResolver;
  private readonly diagnostics: DiagnosticsCollector | undefined;

  // Track imports per file for resolving ReturnType<typeof func>
  private importMap: Record<string, Record<string, string>> = {}; // { filePath: { importName: importPath } }
  // Inverted index: typeName → first filePath that imports it (O(1) lookup for findFileImportingType)
  private typeToFileIndex: Map<string, string> = new Map();
  private indexedReExportFiles: Set<string> = new Set();
  private currentFilePath: string = ""; // Track the file being processed

  constructor(
    schemaDir: string | string[],
    schemaType: SchemaType | SchemaType[] = "typescript",
    schemaFiles?: string[],
    apiDir?: string,
    fileAccess: SchemaProcessorFileAccess = defaultFileAccess,
    runtime?: SharedGenerationRuntime,
    diagnostics?: DiagnosticsCollector,
    performanceProfile?: GenerationPerformanceProfile,
  ) {
    this.schemaDirs = normalizeSchemaDirs(schemaDir).map((d) =>
      path.isAbsolute(d) ? d : path.resolve(d),
    );
    this.schemaTypes = normalizeSchemaTypes(schemaType);
    this.fileAccess = fileAccess;
    this.diagnostics = diagnostics;
    this.sharedRuntime = runtime;
    if (runtime) {
      this.directoryCache = runtime.schema.directoryCache;
      this.statCache = runtime.schema.statCache;
      this.fileASTCache = runtime.schema.fileASTCache;
      this.schemaFiles = runtime.schema.schemaFiles;
      this.schemaDefinitionIndex = runtime.schema.schemaDefinitionIndex;
    }
    this.customSchemaProcessor = new CustomSchemaProcessor(
      schemaFiles && schemaFiles.length > 0 ? processCustomSchemaFiles(schemaFiles) : {},
    );

    // Initialize Zod converter if Zod is enabled
    if (this.schemaTypes.includes("zod")) {
      this.zodSchemaConverter = new ZodSchemaConverter(
        schemaDir,
        apiDir,
        undefined,
        diagnostics,
        this.fileASTCache,
        runtime?.schema.zod,
        performanceProfile,
      );
      this.zodSchemaProcessor = new ZodSchemaProcessor(this.zodSchemaConverter);
      // Share the AST cache across TS + Zod converters so each file is parsed once.
      this.symbolResolver = this.zodSchemaConverter.symbolResolver;
    } else {
      this.symbolResolver = new SymbolResolver(this.fileAccess, this.fileASTCache);
    }
  }

  /**
   * Get all defined schemas (for components.schemas section)
   * Merges schemas from all sources with proper priority:
   * 1. TypeScript types (lowest priority - base layer)
   * 2. Zod schemas (medium priority)
   * 3. Custom files (highest priority - overrides all)
   */
  public getDefinedSchemas(): Record<string, OpenAPIDefinition> {
    const filteredSchemas: Record<string, OpenAPIDefinition> = {};
    Object.entries(this.openapiDefinitions).forEach(([key, value]) => {
      if (
        !this.schemaIdAliases[key] &&
        !this.isGenericTypeParameter(key) &&
        !this.isInvalidSchemaName(key) &&
        !this.isBuiltInUtilityType(key) &&
        !this.isFunctionSchema(key) &&
        !this.internalSchemaNames.has(key)
      ) {
        filteredSchemas[key] = value;
      }
    });

    return mergeSchemaDefinitionLayers([
      filteredSchemas,
      this.zodSchemaProcessor?.getDefinedSchemas(),
      this.customSchemaProcessor.getDefinedSchemas(),
    ]);
  }

  public getInternalSchemas(): Record<string, OpenAPIDefinition> {
    const result: Record<string, OpenAPIDefinition> = {};
    for (const name of this.internalSchemaNames) {
      const def = this.openapiDefinitions[name];
      if (def) result[name] = def;
    }
    if (this.zodSchemaConverter) {
      for (const name of this.zodSchemaConverter.internalSchemaNames) {
        const schema = this.zodSchemaConverter.zodSchemas[name];
        if (schema) result[name] = schema;
      }
    }
    return result;
  }

  public preprocessZodSchemas(): void {
    this.zodSchemaConverter?.preprocessSchemaDirectories();
    const zodDefinitions = this.zodSchemaProcessor?.getDefinedSchemas();
    if (zodDefinitions) {
      Object.assign(this.openapiDefinitions, zodDefinitions);
    }
  }

  public findSchemaDefinition(schemaName: string, contentType: ContentType): OpenAPIDefinition {
    // Assign type that is actually processed
    this.contentType = contentType;

    // Check if the schemaName is a generic type (contains < and >)
    if (schemaName.includes("<") && schemaName.includes(">")) {
      return this.resolveGenericTypeFromString(schemaName);
    }

    // Redirect original name to its @id override
    const overrideId = this.schemaIdAliases[schemaName];
    if (overrideId) {
      return this.findSchemaDefinition(overrideId, contentType);
    }

    const cachedDefinition = this.openapiDefinitions[schemaName];
    if (cachedDefinition && this.isConcreteOpenApiDefinition(cachedDefinition)) {
      return cachedDefinition;
    }

    // Priority 1: Check custom schemas first (highest priority)
    const customSchema = this.customSchemaProcessor.resolveSchema(schemaName);
    if (customSchema) {
      logger.debug(`Found schema in custom files: ${schemaName}`);
      return customSchema;
    }

    // Priority 2: Try Zod schemas if enabled
    if (this.schemaTypes.includes("zod") && this.zodSchemaProcessor && this.zodSchemaConverter) {
      logger.debug(`Looking for Zod schema: ${schemaName}`);

      // Check type mapping first
      const mappedSchemaName = this.zodSchemaConverter.typeToSchemaMapping[schemaName];
      if (mappedSchemaName) {
        logger.debug(`Type '${schemaName}' is mapped to Zod schema '${mappedSchemaName}'`);
      }

      // Try to convert Zod schema
      const zodSchema = this.zodSchemaProcessor.resolveSchema(schemaName, contentType);
      if (zodSchema) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        this.openapiDefinitions[schemaName] = zodSchema;
        return zodSchema;
      }

      logger.debug(`No Zod schema found for ${schemaName}, trying TypeScript fallback`);
    }

    // Fall back to TypeScript types
    this.scanAllSchemaDirs(schemaName);
    return this.openapiDefinitions[schemaName] || {};
  }

  public hasSchemaCandidate(schemaName: string): boolean {
    this.ensureSchemaIndex();
    return Boolean(
      this.openapiDefinitions[schemaName] || this.schemaDefinitionIndex[schemaName]?.length,
    );
  }

  private scanAllSchemaDirs(schemaName: string) {
    this.ensureSchemaIndex();

    const candidateFiles = this.schemaDefinitionIndex[schemaName] ?? this.schemaFiles!;
    for (const filePath of candidateFiles) {
      this.processSchemaFile(filePath, schemaName);
      if (this.openapiDefinitions[schemaName]) {
        return;
      }
    }
  }

  private ensureSchemaIndex(): void {
    if (this.schemaFiles) {
      return;
    }

    this.schemaFiles = [];
    if (this.sharedRuntime) {
      this.sharedRuntime.schema.schemaFiles = this.schemaFiles;
    }

    for (const dir of this.schemaDirs) {
      if (!this.fileAccess.existsSync(dir)) {
        logger.warn(`Schema directory not found: ${dir}`);
        this.diagnostics?.add({
          code: "schema-dir-empty",
          severity: "warning",
          message: `Configured schema directory does not exist: ${dir}`,
          filePath: dir,
        });
        continue;
      }

      const definitionCountBefore = Object.keys(this.schemaDefinitionIndex).length;
      this.scanSchemaDir(dir);
      const definitionCountAfter = Object.keys(this.schemaDefinitionIndex).length;
      if (definitionCountAfter === definitionCountBefore) {
        this.diagnostics?.add({
          code: "schema-dir-empty",
          severity: "warning",
          message: `Configured schema directory produced no concrete schema declarations: ${dir}`,
          filePath: dir,
        });
      }
    }
  }

  private scanSchemaDir(dir: string) {
    let files = this.directoryCache[dir];
    if (typeof files === "undefined") {
      files = this.fileAccess.readdirSync(dir);
      this.directoryCache[dir] = files;
    }

    files.forEach((file) => {
      const filePath = dir.startsWith("/") ? path.posix.join(dir, file) : path.join(dir, file);
      let stat = this.statCache[filePath];
      if (typeof stat === "undefined") {
        stat = this.fileAccess.statSync(filePath);
        this.statCache[filePath] = stat;
      }

      if (stat.isDirectory()) {
        this.scanSchemaDir(filePath);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        this.schemaFiles!.push(filePath);
        this.indexSchemaFile(filePath);
      }
    });
  }

  private indexSchemaFile(filePath: string): void {
    let ast: t.File;
    try {
      ast = this.getParsedSchemaFile(filePath);
    } catch (error) {
      logger.error(
        `Error indexing schema file ${filePath}: ${getSchemaProcessorErrorMessage(error)}`,
      );
      return;
    }

    this.collectImports(ast, filePath);

    const aliasesBeforeFile = new Set(Object.keys(this.schemaIdAliases));
    this.collectAllExportedDefinitions(ast, filePath);

    collectTopLevelDefinitionNames(ast).forEach((name) => {
      const indexedFiles = this.schemaDefinitionIndex[name];
      if (indexedFiles) {
        if (!indexedFiles.includes(filePath)) {
          indexedFiles.push(filePath);
        }
        return;
      }

      this.schemaDefinitionIndex[name] = [filePath];
    });

    Object.entries(this.schemaIdAliases).forEach(([originalName, aliasName]) => {
      if (aliasesBeforeFile.has(originalName)) return;
      if (!this.schemaDefinitionIndex[aliasName]) {
        this.schemaDefinitionIndex[aliasName] = [];
      }
      if (!this.schemaDefinitionIndex[aliasName].includes(filePath)) {
        this.schemaDefinitionIndex[aliasName].push(filePath);
      }
    });

    this.followSchemaReExports(ast, filePath);
  }

  private followSchemaReExports(ast: t.File, filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    if (this.indexedReExportFiles.has(normalizedPath)) {
      return;
    }

    this.indexedReExportFiles.add(normalizedPath);

    traverse(ast, {
      ExportAllDeclaration: (nodePath) => {
        const source = nodePath.node.source?.value;
        if (typeof source !== "string") {
          return;
        }

        const resolvedPath = resolveImportPath(source, filePath, this.fileAccess);
        if (resolvedPath) {
          this.indexSchemaFile(resolvedPath);
        }
      },
      ExportNamedDeclaration: (nodePath) => {
        if (!nodePath.node.source) {
          return;
        }

        const source = nodePath.node.source.value;
        const resolvedPath = resolveImportPath(source, filePath, this.fileAccess);
        if (resolvedPath) {
          this.indexSchemaFile(resolvedPath);
        }
      },
    });
  }

  private getParsedSchemaFile(filePath: string): t.File {
    const cachedAst = this.fileASTCache.get(filePath);
    if (cachedAst) {
      return cachedAst;
    }

    const content = this.fileAccess.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);
    this.fileASTCache.set(filePath, ast);
    return ast;
  }

  private collectImports(ast: t.File, filePath: string): void {
    collectImports(ast, filePath, this.importMap);
    const normalizedPath = path.normalize(filePath);
    const entries = this.importMap[normalizedPath] ?? {};
    for (const typeName of Object.keys(entries)) {
      if (!this.typeToFileIndex.has(typeName)) {
        this.typeToFileIndex.set(typeName, normalizedPath);
      }
    }
  }

  /**
   * Resolve an import path relative to the current file
   * Converts import paths like "../app/api/products/route.utils" to absolute file paths.
   * Uses the shared {@link SymbolResolver} so repeated lookups are cached (including
   * negative results) and the same module graph is shared with the Zod converter.
   */
  private resolveImportPath(importPath: string, fromFilePath: string): string | null {
    const viaResolver = this.symbolResolver.resolveImportPath(fromFilePath, importPath);
    if (viaResolver !== null) return viaResolver;
    // Fall back to the legacy helper for non-relative imports (the resolver only handles
    // relative paths).
    return resolveImportPath(importPath, fromFilePath, this.fileAccess);
  }

  /**
   * Collect all exported type definitions from an AST without filtering by name
   * Used when processing imported files to ensure all referenced types are available
   */
  private collectAllExportedDefinitions(ast: any, filePath?: string): void {
    collectAllExportedDefinitions(
      ast,
      this.typeDefinitions,
      filePath || this.currentFilePath,
      this.schemaIdAliases,
      this.internalSchemaNames,
    );
  }

  private collectTypeDefinitions(ast: any, schemaName: string, filePath?: string): void {
    collectTypeDefinitions(ast, schemaName, this.typeDefinitions, filePath || this.currentFilePath);
  }

  private isConcreteOpenApiDefinition(definition: OpenAPIDefinition): boolean {
    if (definition.$ref) {
      return true;
    }

    if (definition.properties && Object.keys(definition.properties).length > 0) {
      return true;
    }

    if (definition.enum || definition.const) {
      return true;
    }

    if (definition.allOf || definition.oneOf || definition.anyOf) {
      return true;
    }

    if (definition.items || definition.prefixItems) {
      return true;
    }

    if (definition.type && definition.type !== "object") {
      return true;
    }

    return false;
  }

  private resolveType(typeName: string): OpenAPIDefinition {
    if (this.processingTypes.has(typeName)) {
      // Return reference to type to avoid infinite recursion
      return { $ref: `#/components/schemas/${typeName}` };
    }
    // Add type to processing types
    this.processingTypes.add(typeName);

    try {
      // If we are using Zod and the given type is not found yet, try using Zod converter first
      if (
        this.schemaTypes.includes("zod") &&
        this.zodSchemaConverter &&
        !this.openapiDefinitions[typeName]
      ) {
        const zodSchema = this.zodSchemaConverter.convertZodSchemaToOpenApi(
          typeName,
          this.contentType,
        );
        if (zodSchema) {
          this.openapiDefinitions[typeName] = zodSchema;
          return zodSchema;
        }
      }

      const typeDefEntry = this.typeDefinitions[typeName];
      if (!typeDefEntry) {
        // The type is not defined in any of the scanned schema dirs. It may come from
        // node_modules or a directory not covered by schemaDir (e.g. a shared package
        // whose types are `z.infer<typeof schema>` aliases). As a fallback, look for any
        // scanned file that imports this type and use the TypeScript language service to
        // resolve it — the compiler already knows the full shape of imported types.
        const contextFile = this.findFileImportingType(typeName);
        if (contextFile && this.schemaTypes.includes("typescript")) {
          logger.debug(
            `resolveType: "${typeName}" not in schema dirs; attempting TypeScript checker fallback via ${contextFile}`,
          );
          const checkerSchema = this.resolveTypeWithTypeScriptChecker(typeName, contextFile);
          if (checkerSchema && Object.keys(checkerSchema).length > 0) {
            this.openapiDefinitions[typeName] = checkerSchema;
            return checkerSchema;
          }
        }
        logger.debug(
          `resolveType: no TypeScript definition found for "${typeName}" in ${this.currentFilePath}; returning empty schema`,
        );
        this.diagnostics?.add({
          code: "schema-not-found",
          severity: "warning",
          message: `No TypeScript or Zod schema definition found for "${typeName}"; emitting an empty schema.`,
          filePath: this.currentFilePath || undefined,
          metadata: {
            typeName,
            contextFile,
            suggestedFix:
              "Add the type to schemaDir, export it from an indexed schema file, or reference an explicit @response/@body/@params schema.",
          },
        });
        return {};
      }
      const typeNode = typeDefEntry.node || typeDefEntry; // Support both old and new format

      if (
        typeDefEntry.filePath &&
        this.schemaTypes.includes("typescript") &&
        this.shouldUseTypeScriptChecker(typeNode)
      ) {
        const checkerSchema = this.resolveTypeWithTypeScriptChecker(
          typeName,
          typeDefEntry.filePath,
        );
        if (
          checkerSchema &&
          !(checkerSchema.type === "object" && Object.keys(checkerSchema).length === 1)
        ) {
          return checkerSchema;
        }
      }

      // Handle generic type alias declarations (full node)
      if (t.isTSTypeAliasDeclaration(typeNode)) {
        // This is a generic type, should be handled by the caller via resolveGenericType
        // For non-generic access, just return the type annotation
        const typeAnnotation = typeNode.typeAnnotation;
        return this.resolveTSNodeType(typeAnnotation);
      }

      // Check if node is Zod
      if (
        t.isCallExpression(typeNode) &&
        t.isMemberExpression(typeNode.callee) &&
        t.isIdentifier(typeNode.callee.object) &&
        typeNode.callee.object.name === "z"
      ) {
        if (this.schemaTypes.includes("zod") && this.zodSchemaConverter) {
          this.zodSchemaConverter.currentContentType = this.contentType;
          const zodSchema = this.zodSchemaConverter.processZodNode(typeNode);
          if (zodSchema) {
            this.openapiDefinitions[typeName] = zodSchema;
            return zodSchema;
          }
        }
      }

      if (t.isTSEnumDeclaration(typeNode)) {
        const enumValues = this.processEnum(typeNode);
        return enumValues;
      }

      if (
        t.isTSTypeLiteral(typeNode) ||
        t.isTSInterfaceBody(typeNode) ||
        t.isTSInterfaceDeclaration(typeNode)
      ) {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        // Handle interface extends clause
        if (
          t.isTSInterfaceDeclaration(typeNode) &&
          typeNode.extends &&
          typeNode.extends.length > 0
        ) {
          typeNode.extends.forEach((extendedType: any) => {
            const extendedSchema = this.resolveTSNodeType(extendedType);
            if (extendedSchema.properties) {
              Object.assign(properties, extendedSchema.properties);
            }
          });
        }

        // Get members from interface declaration body or direct members
        const members = t.isTSInterfaceDeclaration(typeNode)
          ? typeNode.body.body
          : (typeNode as any).members;

        if (members) {
          let additionalProperties: OpenAPIDefinition | boolean | undefined;
          (members || []).forEach((member: any) => {
            if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
              const propName = member.key.name;
              const options = getPropertyOptions(member, this.contentType);

              const property = {
                ...this.resolveTSNodeType(member.typeAnnotation?.typeAnnotation),
                ...options,
              };

              applyPropertyOpenApiOverride(member, property);
              properties[propName] = property;
              if (!member.optional) {
                required.push(propName);
              }
              return;
            }

            if (t.isTSIndexSignature(member)) {
              additionalProperties = member.typeAnnotation?.typeAnnotation
                ? this.resolveTSNodeType(member.typeAnnotation.typeAnnotation)
                : true;
            }
          });

          const result: OpenAPIDefinition = { type: "object", properties };
          if (required.length > 0) {
            result.required = required;
          }
          if (additionalProperties !== undefined) {
            result.additionalProperties = additionalProperties;
          }
          return result;
        }

        return required.length > 0
          ? { type: "object", properties, required }
          : { type: "object", properties };
      }

      if (t.isTSArrayType(typeNode)) {
        return {
          type: "array",
          items: this.resolveTSNodeType(typeNode.elementType),
        };
      }

      if (t.isTSUnionType(typeNode)) {
        return this.resolveTSNodeType(typeNode);
      }

      if (t.isTSTypeReference(typeNode)) {
        return this.resolveTSNodeType(typeNode);
      }

      // Handle indexed access types (e.g., Parameters<typeof func>[0])
      if (t.isTSIndexedAccessType(typeNode)) {
        return this.resolveTSNodeType(typeNode);
      }

      return this.resolveTSNodeType(typeNode);
    } finally {
      // Remove type from processed set after we finish
      this.processingTypes.delete(typeName);
    }
  }

  private addTypeResolutionFallbackDiagnostic(message: string, metadata?: Record<string, unknown>) {
    this.diagnostics?.add({
      code: "type-resolution-fallback",
      severity: "info",
      message,
      filePath: this.currentFilePath || undefined,
      metadata,
    });
  }

  /**
   * Follow `$ref` back to its target schema (if known) and return the properties
   * map, so callers like `keyof` can enumerate the keys. Returns `null` when no
   * properties are reachable.
   */
  private unwrapSchemaProperties(
    schema: OpenAPIDefinition | undefined,
  ): Record<string, OpenAPIDefinition> | null {
    if (!schema) return null;
    if (schema.properties) return schema.properties;
    if (schema.$ref && schema.$ref.startsWith("#/components/schemas/")) {
      const refName = schema.$ref.replace("#/components/schemas/", "");
      const target = this.openapiDefinitions[refName] ?? this.typeDefinitions[refName];
      if (target && !t.isNode?.(target)) {
        const resolved = this.openapiDefinitions[refName];
        if (resolved && resolved.properties) return resolved.properties;
      }
      // If we haven't emitted the definition yet, try to resolve on demand.
      const onDemand = this.resolveType(refName);
      if (onDemand && onDemand.properties) return onDemand.properties;
    }
    if (Array.isArray(schema.allOf)) {
      const merged: Record<string, OpenAPIDefinition> = {};
      for (const item of schema.allOf) {
        const props = this.unwrapSchemaProperties(item);
        if (props) Object.assign(merged, props);
      }
      if (Object.keys(merged).length > 0) return merged;
    }
    return null;
  }

  /**
   * Return the path of the first scanned file that imports `typeName`, or `null` when none is
   * found. Used as a fallback context for {@link resolveTypeWithTypeScriptChecker} when the type
   * is not defined in any schema-dir file (e.g. comes from node_modules or a shared package).
   */
  private findFileImportingType(typeName: string): string | null {
    return this.typeToFileIndex.get(typeName) ?? null;
  }

  private shouldUseTypeScriptChecker(node: t.Node): boolean {
    return (
      t.isTSConditionalType(node) ||
      t.isTSIndexedAccessType(node) ||
      t.isTSMappedType(node) ||
      t.isTSTemplateLiteralType(node) ||
      t.isTSImportType(node) ||
      t.isTSInferType(node) ||
      t.isTSInstantiationExpression(node) ||
      t.isTSFunctionType(node) ||
      t.isTSConstructorType(node) ||
      t.isTSIntersectionType(node) ||
      (t.isTSTypeOperator(node) && (node.operator === "keyof" || node.operator === "readonly"))
    );
  }

  private extractKeysFromTypeNode(node: t.Node | null | undefined): string[] {
    if (!node) {
      return [];
    }

    if (t.isTSUnionType(node)) {
      return node.types.flatMap((typeNode) => this.extractKeysFromTypeNode(typeNode));
    }

    if (t.isTSLiteralType(node) && t.isStringLiteral(node.literal)) {
      return [node.literal.value];
    }

    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const typeDefinition = this.typeDefinitions[node.typeName.name];
      if (typeDefinition?.node) {
        return this.extractKeysFromTypeNode(typeDefinition.node);
      }
    }

    return [];
  }

  private areTypesStaticallyCompatible(left: t.Node, right: t.Node): boolean {
    if (left.type === right.type) {
      if (t.isTSLiteralType(left) && t.isTSLiteralType(right)) {
        return (
          extractKeysFromLiteralType(left).join("|") === extractKeysFromLiteralType(right).join("|")
        );
      }

      return true;
    }

    return false;
  }

  private resolveTypeWithTypeScriptChecker(
    typeName: string,
    filePath: string,
  ): OpenAPIDefinition | null {
    try {
      const adapter = getTypeScriptAdapter(filePath);
      if (adapter.kind === "native") {
        return adapter.resolveTypeByName(typeName, filePath);
      }

      const project = getTypeScriptProject(filePath);
      const ts = project.ts;
      const sourceFile = project.program.getSourceFile(filePath);
      if (!sourceFile) {
        return null;
      }

      const symbol = project.checker
        .getSymbolsInScope(sourceFile, ts.SymbolFlags.Type | ts.SymbolFlags.Alias)
        .find((candidate) => candidate.name === typeName);
      if (!symbol) {
        return null;
      }

      const targetSymbol =
        symbol.flags & ts.SymbolFlags.Alias ? project.checker.getAliasedSymbol(symbol) : symbol;
      const declaration = targetSymbol.declarations?.[0];
      if (!declaration) {
        return null;
      }

      const resolvedType =
        targetSymbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
          ? project.checker.getDeclaredTypeOfSymbol(targetSymbol)
          : project.checker.getTypeAtLocation(declaration);
      return this.typeScriptTypeToOpenApiSchema(
        resolvedType,
        project.checker,
        new Set<string>(),
        ts,
      );
    } catch (error) {
      logger.debug(
        `TypeScript checker fallback failed for ${typeName}: ${getSchemaProcessorErrorMessage(error)}`,
      );
      return null;
    }
  }

  private typeScriptTypeToOpenApiSchema(
    type: ts.Type,
    checker: ts.TypeChecker,
    seen: Set<string>,
    ts: TypeScriptRuntime,
  ): OpenAPIDefinition {
    if (isDateType(type, checker)) {
      return { type: "string", format: "date-time" };
    }

    const primitiveLikeFlags =
      ts.TypeFlags.StringLike |
      ts.TypeFlags.NumberLike |
      ts.TypeFlags.BooleanLike |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.TemplateLiteral |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined;
    const apparentType = checker.getApparentType(type);
    if (
      !(type.flags & primitiveLikeFlags) &&
      apparentType !== type &&
      checker.getPropertiesOfType(apparentType).length > 0
    ) {
      type = apparentType;
    }

    const seenKey = checker.typeToString(type);
    if (seen.has(seenKey)) {
      return { type: "object" };
    }

    // Only track non-trivial types in `seen`. Primitives (string, number, boolean, null, etc.)
    // may appear on multiple properties of the same object without being circular — adding them
    // to `seen` would incorrectly turn their second occurrence into `{ type: "object" }`.
    if (
      !(
        type.flags &
        (primitiveLikeFlags |
          ts.TypeFlags.Any |
          ts.TypeFlags.Never |
          ts.TypeFlags.Unknown |
          ts.TypeFlags.Void)
      )
    ) {
      seen.add(seenKey);
    }

    if (type.isStringLiteral()) {
      return { type: "string", enum: [type.value] };
    }

    if (type.isNumberLiteral()) {
      return { type: "number", enum: [type.value] };
    }

    if (type.flags & ts.TypeFlags.BooleanLiteral) {
      return {
        type: "boolean",
        enum: [checker.typeToString(type) === "true"],
      };
    }

    if (type.flags & ts.TypeFlags.TemplateLiteral) {
      return { type: "string" };
    }

    if (type.flags & ts.TypeFlags.StringLike) {
      return { type: "string" };
    }
    if (type.flags & ts.TypeFlags.NumberLike) {
      return { type: "number" };
    }
    if (type.flags & ts.TypeFlags.BooleanLike) {
      return { type: "boolean" };
    }
    if (type.flags & ts.TypeFlags.Null) {
      return { type: "null" };
    }

    if (type.isUnion()) {
      const nullable = type.types.some((member) => member.flags & ts.TypeFlags.Null);
      const nonNullTypes = type.types.filter((member) => !(member.flags & ts.TypeFlags.Null));
      const allLiterals = nonNullTypes.every(
        (member) =>
          member.isStringLiteral() ||
          member.isNumberLiteral() ||
          Boolean(member.flags & ts.TypeFlags.BooleanLiteral),
      );
      if (allLiterals && nonNullTypes.length > 0) {
        const enumValues = nonNullTypes.map((member) => {
          if (member.isStringLiteral() || member.isNumberLiteral()) {
            return member.value;
          }
          return checker.typeToString(member) === "true";
        });
        const valueType = typeof enumValues[0];
        return {
          type: valueType === "number" ? "number" : valueType === "boolean" ? "boolean" : "string",
          enum: enumValues,
          ...(nullable ? { nullable: true } : {}),
        };
      }

      if (nullable && nonNullTypes.length === 1 && nonNullTypes[0]) {
        return {
          ...this.typeScriptTypeToOpenApiSchema(nonNullTypes[0], checker, seen, ts),
          nullable: true,
        };
      }

      return {
        oneOf: nonNullTypes.map((member) =>
          this.typeScriptTypeToOpenApiSchema(member, checker, seen, ts),
        ),
      };
    }

    if (checker.isTupleType(type)) {
      const itemTypes = checker.getTypeArguments(type as ts.TypeReference);
      return {
        type: "array",
        prefixItems: itemTypes.map((itemType) =>
          this.typeScriptTypeToOpenApiSchema(itemType, checker, seen, ts),
        ),
        items: false,
        minItems: itemTypes.length,
        maxItems: itemTypes.length,
      };
    }

    if (checker.isArrayType(type)) {
      const elementType = checker.getTypeArguments(type as ts.TypeReference)[0];
      return {
        type: "array",
        items: elementType
          ? this.typeScriptTypeToOpenApiSchema(elementType, checker, seen, ts)
          : { type: "object" },
      };
    }

    const properties = checker.getPropertiesOfType(type);
    if (properties.length > 0) {
      const schemaProperties: Record<string, OpenAPIDefinition> = {};
      const required: string[] = [];

      properties.forEach((property) => {
        const propertyDeclaration = property.valueDeclaration || property.declarations?.[0];
        if (!propertyDeclaration) {
          return;
        }

        const propertyType = checker.getTypeOfSymbolAtLocation(property, propertyDeclaration);
        schemaProperties[property.getName()] = this.typeScriptTypeToOpenApiSchema(
          propertyType,
          checker,
          seen,
          ts,
        );
        if (!(property.flags & ts.SymbolFlags.Optional)) {
          required.push(property.getName());
        }
      });

      return required.length > 0
        ? { type: "object", properties: schemaProperties, required }
        : { type: "object", properties: schemaProperties };
    }

    if (type.getNumberIndexType()) {
      return {
        type: "array",
        items: this.typeScriptTypeToOpenApiSchema(type.getNumberIndexType()!, checker, seen, ts),
      };
    }

    if (type.getStringIndexType()) {
      return {
        type: "object",
        additionalProperties: this.typeScriptTypeToOpenApiSchema(
          type.getStringIndexType()!,
          checker,
          seen,
          ts,
        ),
      };
    }

    return { type: "object" };
  }

  private resolveTSNodeType(node: any): OpenAPIDefinition {
    return resolveTypeNodeSchema(this as never, node);
  }

  private processSchemaFile(filePath: string, schemaName: string): OpenAPIDefinition | undefined {
    // Check if the file has already been processed
    if (this.processSchemaTracker[`${filePath}-${schemaName}`]) return;

    try {
      const ast = this.getParsedSchemaFile(filePath);

      // Track current file path for import resolution (normalize for consistency)
      this.currentFilePath = path.normalize(filePath);

      // Collect imports from this file
      this.collectImports(ast, filePath);

      // Collect type definitions, passing the file path explicitly
      this.collectTypeDefinitions(ast, schemaName, filePath);

      // Reset the set of processed types before each schema processing
      this.processingTypes.clear();
      const definition = this.resolveType(schemaName);
      if (!this.isResolvingPickOmitBase) {
        this.openapiDefinitions[schemaName] = definition;
      }

      this.processSchemaTracker[`${filePath}-${schemaName}`] = true;
      return definition;
    } catch (error) {
      logger.error(
        `Error processing schema file ${filePath} for schema ${schemaName}: ${getSchemaProcessorErrorMessage(error)}`,
      );
      return {};
    }
  }

  private processEnum(enumNode: any): OpenAPIDefinition {
    // Initialization OpenAPI enum object
    const enumSchema: OpenAPIDefinition = {
      type: "string",
      enum: [],
    };

    // Iterate throught enum members
    enumNode.members.forEach((member: any) => {
      if (t.isTSEnumMember(member)) {
        // @ts-ignore
        const name = member.id?.name;
        // @ts-ignore
        const value = member.initializer?.value;
        let type = member.initializer?.type;

        if (type === "NumericLiteral") {
          enumSchema.type = "number";
        }

        const targetValue = value || name;

        if (enumSchema.enum) {
          enumSchema.enum.push(targetValue);
        }
      }
    });

    return enumSchema;
  }

  /**
   * Generate example values based on parameter type and name
   */
  public getExampleForParam(
    paramName: string,
    typeOrSchema: string | OpenApiSchemaLike = "string",
  ): any {
    return getExampleForParam(paramName, typeOrSchema);
  }

  public detectContentType(bodyType: string, explicitContentType?: string): string {
    return detectContentType(bodyType, explicitContentType);
  }

  public createMultipleResponsesSchema(
    responses: Record<string, any>,
    defaultDescription?: string,
  ): Record<string, any> {
    return createMultipleResponsesSchema(responses, defaultDescription);
  }

  private createFormDataSchema(body: OpenAPIDefinition): OpenAPIDefinition {
    const mediaType = createRequestBodySchema(body, undefined, "multipart/form-data").content[
      "multipart/form-data"
    ];
    return mediaType && "schema" in mediaType
      ? (mediaType.schema as OpenAPIDefinition)
      : { type: "object" };
  }

  /**
   * Create a default schema for path parameters when no schema is defined
   */
  public createDefaultPathParamsSchema(paramNames: string[]): ParamSchema[] {
    return createDefaultPathParamsSchema(paramNames);
  }

  public createRequestParamsSchema(
    params: OpenAPIDefinition,
    isPathParam: boolean = false,
    forcedIn?: "query" | "path" | "header" | "cookie",
  ): ParamSchema[] {
    return createRequestParamsSchema(params, isPathParam, forcedIn);
  }

  public createRequestBodySchema(
    body: OpenAPIDefinition,
    description?: string,
    contentType?: string,
    examples?: OpenApiExampleMap,
  ): any {
    return createRequestBodySchema(body, description, contentType, examples);
  }

  public createResponseSchema(responses: OpenAPIDefinition, description?: string): any {
    return createResponseSchema(responses, description);
  }

  public hasResolvedSchema(typeName: string): boolean {
    let baseTypeName = typeName.trim();
    while (baseTypeName.endsWith("[]")) {
      baseTypeName = baseTypeName.slice(0, -2);
    }

    return Boolean(this.openapiDefinitions[baseTypeName]);
  }

  public resolveTypeExpression(typeExpression: string): OpenAPIDefinition {
    const trimmedExpression = typeExpression.trim();
    if (!trimmedExpression) {
      return { type: "object" };
    }

    const cachedDefinition = this.inlineTypeCache.get(trimmedExpression);
    if (cachedDefinition) {
      return cachedDefinition;
    }

    try {
      const ast = parseTypeScriptFile(`type __InlineResponse = ${trimmedExpression};`);
      const declaration = ast.program.body.find((statement) =>
        t.isTSTypeAliasDeclaration(statement),
      );

      if (declaration && t.isTSTypeAliasDeclaration(declaration)) {
        const resolvedType = this.resolveTSNodeType(declaration.typeAnnotation);
        this.inlineTypeCache.set(trimmedExpression, resolvedType);
        return resolvedType;
      }
    } catch {
      // Fall through to object below when the inline expression cannot be parsed.
    }

    return { type: "object" };
  }

  public getSchemaContent({
    tag,
    paramsType,
    querystringType,
    pathParamsType,
    bodyType,
    responseType,
  }: any): {
    tag: OpenAPIDefinition;
    params: OpenAPIDefinition;
    querystring: OpenAPIDefinition;
    pathParams: OpenAPIDefinition;
    body: OpenAPIDefinition;
    responses: OpenAPIDefinition;
  } {
    const cacheKey = JSON.stringify({
      tag,
      paramsType,
      querystringType,
      pathParamsType,
      bodyType,
      responseType,
    });
    const cachedContent = this.schemaContentCache.get(cacheKey);
    if (cachedContent) {
      return cachedContent;
    }

    const content = getSchemaContent(
      { tag, paramsType, querystringType, pathParamsType, bodyType, responseType },
      {
        openapiDefinitions: this.openapiDefinitions,
        schemaTypes: this.schemaTypes,
        findSchemaDefinition: (schemaName, contentType) =>
          this.findSchemaDefinition(schemaName, contentType as ContentType),
      },
    );
    this.schemaContentCache.set(cacheKey, content);
    return content;
  }

  public ensureSchemaResolved(typeName: string, contentType: ContentType = "response"): void {
    let baseTypeName = typeName.trim();
    while (baseTypeName.endsWith("[]")) {
      baseTypeName = baseTypeName.slice(0, -2);
    }

    if (!baseTypeName || baseTypeName.startsWith("{") || baseTypeName.startsWith("[")) {
      return;
    }

    const cacheKey = `${contentType}:${baseTypeName}`;
    if (this.resolvedSchemaCache.has(cacheKey)) {
      return;
    }

    if (!this.openapiDefinitions[baseTypeName]) {
      this.findSchemaDefinition(baseTypeName, contentType);
    }
    this.resolvedSchemaCache.add(cacheKey);
  }

  public getSchemaReferenceName(typeName: string, contentType: ContentType = "response"): string {
    let baseTypeName = typeName.trim();
    while (baseTypeName.endsWith("[]")) {
      baseTypeName = baseTypeName.slice(0, -2);
    }

    if (
      !baseTypeName ||
      baseTypeName.startsWith("{") ||
      baseTypeName.startsWith("[") ||
      baseTypeName === "string" ||
      baseTypeName === "number" ||
      baseTypeName === "boolean" ||
      baseTypeName === "null"
    ) {
      return baseTypeName;
    }

    this.ensureSchemaResolved(baseTypeName, contentType);

    if (this.schemaTypes.includes("zod") && this.zodSchemaConverter) {
      return this.zodSchemaConverter.getSchemaReferenceName(baseTypeName, contentType);
    }

    const aliasedName = this.schemaIdAliases[baseTypeName] ?? baseTypeName;
    return aliasedName;
  }

  /**
   * Parse and resolve a generic type from a string like "MyApiSuccessResponseBody<LLMSResponse>"
   * @param genericTypeString - The generic type string to parse and resolve
   * @returns The resolved OpenAPI schema
   */
  private resolveGenericTypeFromString(genericTypeString: string): OpenAPIDefinition {
    return resolveGenericTypeFromStringValue(this as never, genericTypeString);
  }

  /**
   * Check if a type name is likely a generic type parameter (e.g., T, U, K, V)
   * @param {string} typeName - The type name to check
   * @returns {boolean} - True if it's likely a generic type parameter
   */
  private isGenericTypeParameter(typeName: string) {
    // Common generic type parameter patterns:
    // - Single uppercase letters (T, U, K, V, etc.)
    // - TKey, TValue, etc.
    return /^[A-Z]$|^T[A-Z][a-zA-Z]*$/.test(typeName);
  }

  /**
   * Check if a schema name is invalid (contains special characters, brackets, etc.)
   * @param {string} schemaName - The schema name to check
   * @returns {boolean} - True if the schema name is invalid
   */
  private isInvalidSchemaName(schemaName: string) {
    // Schema names should not contain { } : ? spaces or other special characters
    return /[{}\s:?]/.test(schemaName);
  }

  /**
   * Check if a type name is a built-in TypeScript utility type
   * @param {string} typeName - The type name to check
   * @returns {boolean} - True if it's a built-in utility type
   */
  private isBuiltInUtilityType(typeName: string) {
    const builtInTypes = [
      "Awaited",
      "Partial",
      "Required",
      "Readonly",
      "Record",
      "Pick",
      "Omit",
      "Exclude",
      "Extract",
      "NonNullable",
      "Parameters",
      "ConstructorParameters",
      "ReturnType",
      "InstanceType",
      "ThisParameterType",
      "OmitThisParameter",
      "ThisType",
      "Uppercase",
      "Lowercase",
      "Capitalize",
      "Uncapitalize",
      "Promise",
      "Array",
      "ReadonlyArray",
      "Map",
      "Set",
      "WeakMap",
      "WeakSet",
    ];
    return builtInTypes.includes(typeName);
  }

  /**
   * Check if a schema name is a function (should not be included in schemas)
   * Functions are identified by having a node that is a function declaration
   */
  private isFunctionSchema(schemaName: string): boolean {
    const entry = this.typeDefinitions[schemaName];
    if (!entry) return false;

    const node = entry.node || entry;
    return (
      t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isArrowFunctionExpression(node)
    );
  }

  /**
   * Resolve generic types by substituting type parameters with actual types
   * @param genericTypeDefinition - The AST node of the generic type definition
   * @param typeArguments - The type arguments passed to the generic type
   * @param typeName - The name of the generic type
   * @returns The resolved OpenAPI schema
   */
  private resolveGenericType(
    genericTypeDefinition: any,
    typeArguments: any[],
    typeName: string,
  ): OpenAPIDefinition {
    return resolveGenericTypeValue(this as never, genericTypeDefinition, typeArguments, typeName);
  }

  private resolveTypeWithSubstitution(
    node: any,
    typeParameterMap: Record<string, any>,
  ): OpenAPIDefinition {
    return resolveTypeWithSubstitutionValue(this as never, node, typeParameterMap);
  }
}
