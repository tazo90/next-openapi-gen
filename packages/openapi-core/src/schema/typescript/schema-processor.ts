import fs from "fs";
import path from "path";
import * as t from "@babel/types";
import type * as ts from "typescript";

import { processCustomSchemaFiles } from "../core/custom-schema-file-processor.js";
import { CustomSchemaProcessor } from "../core/custom-schema-processor.js";
import { mergeSchemaDefinitionLayers } from "../core/schema-definition-processor.js";
import { parseTypeScriptFile, parseOpenApiOverrideTag } from "../../shared/utils.js";
import { getTypeScriptProject } from "../../shared/typescript-project.js";
import type { TypeScriptRuntime } from "../../shared/typescript-runtime.js";
import { ZodSchemaConverter } from "../zod/zod-converter.js";
import { ZodSchemaProcessor } from "../zod/zod-schema-processor.js";
import {
  createTypeReferenceFromString,
  detectContentType,
  extractKeysFromLiteralType,
  getExampleForParam,
  getPropertyOptions,
  getSchemaProcessorErrorMessage,
  isDateNode,
  isDateObject,
  isDateString,
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
import { extractFunctionParameters, extractFunctionReturnType } from "./function-nodes.js";
import { resolveUtilityTypeReference } from "./utility-types.js";
import { SymbolResolver } from "../../shared/symbol-resolver.js";
import type {
  ContentType,
  OpenApiExampleMap,
  OpenAPIDefinition,
  ParamSchema,
  PropertyOptions,
  SchemaType,
} from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import type { SharedGenerationRuntime } from "../../core/runtime.js";

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

  private zodSchemaConverter: ZodSchemaConverter | null = null;
  private zodSchemaProcessor: ZodSchemaProcessor | null = null;
  private schemaTypes: SchemaType[];
  private isResolvingPickOmitBase: boolean = false;
  private schemaIdAliases: Record<string, string> = {};
  private internalSchemaNames: Set<string> = new Set();
  private readonly fileAccess: SchemaProcessorFileAccess;
  private readonly symbolResolver: SymbolResolver;

  // Track imports per file for resolving ReturnType<typeof func>
  private importMap: Record<string, Record<string, string>> = {}; // { filePath: { importName: importPath } }
  // Inverted index: typeName → first filePath that imports it (O(1) lookup for findFileImportingType)
  private typeToFileIndex: Map<string, string> = new Map();
  private currentFilePath: string = ""; // Track the file being processed

  constructor(
    schemaDir: string | string[],
    schemaType: SchemaType | SchemaType[] = "typescript",
    schemaFiles?: string[],
    apiDir?: string,
    fileAccess: SchemaProcessorFileAccess = defaultFileAccess,
    runtime?: SharedGenerationRuntime,
  ) {
    this.schemaDirs = normalizeSchemaDirs(schemaDir).map((d) =>
      path.isAbsolute(d) ? d : path.resolve(d),
    );
    this.schemaTypes = normalizeSchemaTypes(schemaType);
    this.fileAccess = fileAccess;
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
      this.zodSchemaConverter = new ZodSchemaConverter(schemaDir, apiDir);
      this.zodSchemaProcessor = new ZodSchemaProcessor(this.zodSchemaConverter);
      // Share the AST cache across TS + Zod converters so each file is parsed once.
      this.symbolResolver = this.zodSchemaConverter.symbolResolver;
    } else {
      this.symbolResolver = new SymbolResolver(
        this.fileAccess as Pick<typeof fs, "existsSync" | "readFileSync">,
        this.fileASTCache,
      );
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

    if (this.openapiDefinitions[schemaName]) {
      return this.openapiDefinitions[schemaName]!;
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

  private scanAllSchemaDirs(schemaName: string) {
    this.ensureSchemaIndex();

    const candidateFiles = this.schemaDefinitionIndex[schemaName] ?? this.schemaFiles ?? [];
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
        continue;
      }

      this.scanSchemaDir(dir);
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
      if (!this.schemaDefinitionIndex[aliasName]!.includes(filePath)) {
        this.schemaDefinitionIndex[aliasName]!.push(filePath);
      }
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

      const typeDefEntry = this.typeDefinitions[typeName.toString()];
      if (!typeDefEntry) {
        // The type is not defined in any of the scanned schema dirs. It may come from
        // node_modules or a directory not covered by schemaDir (e.g. a shared package
        // whose types are `z.infer<typeof schema>` aliases). As a fallback, look for any
        // scanned file that imports this type and use the TypeScript language service to
        // resolve it — the compiler already knows the full shape of imported types.
        const contextFile = this.findFileImportingType(typeName);
        if (contextFile) {
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
        return {};
      }
      const typeNode = typeDefEntry.node || typeDefEntry; // Support both old and new format

      if (typeDefEntry.filePath && this.shouldUseTypeScriptChecker(typeNode)) {
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
          (members || []).forEach((member: any) => {
            if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
              const propName = member.key.name;
              const options = this.getPropertyOptions(member);

              const property = {
                ...this.resolveTSNodeType(member.typeAnnotation?.typeAnnotation),
                ...options,
              };

              applyPropertyOpenApiOverride(member, property);
              properties[propName] = property;
              if (!member.optional) {
                required.push(propName);
              }
            }
          });
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

  private isDateString(node: any): boolean {
    return isDateString(node);
  }

  private isDateObject(node: any): boolean {
    return isDateObject(node);
  }

  private isDateNode(node: any): boolean {
    return isDateNode(node);
  }

  private isBinaryNode(node: any): boolean {
    // Match TS references to common runtime binary types so `File`, `Blob`, etc. become
    // `{ type: "string", format: "binary" }` instead of falling back to `{}`.
    if (!t.isTSTypeReference(node)) return false;
    const typeName = node.typeName;
    if (!t.isIdentifier(typeName)) return false;
    return (
      typeName.name === "File" ||
      typeName.name === "Blob" ||
      typeName.name === "Buffer" ||
      typeName.name === "ArrayBuffer" ||
      typeName.name === "Uint8Array" ||
      typeName.name === "ReadableStream"
    );
  }

  /**
   * Resolve an interpolation type inside a template literal into a concrete list of
   * string values, or `null` when the type cannot be fully materialised.
   */
  private enumerateTemplateLiteralType(node: t.Node | null | undefined): string[] | null {
    if (!node) return null;
    if (t.isTSLiteralType(node)) {
      const literal = node.literal;
      if (t.isStringLiteral(literal)) return [literal.value];
      if (t.isNumericLiteral(literal)) return [String(literal.value)];
      if (t.isBooleanLiteral(literal)) return [String(literal.value)];
      return null;
    }
    if (t.isTSUnionType(node)) {
      const values: string[] = [];
      for (const sub of node.types) {
        const resolved = this.enumerateTemplateLiteralType(sub);
        if (!resolved) return null;
        values.push(...resolved);
      }
      return values;
    }
    return null;
  }

  private tryResolveTemplateLiteralEnum(node: t.TSTemplateLiteralType): OpenAPIDefinition | null {
    const { quasis, types } = node;
    if (types.length === 0) {
      // `\`literal\`` — emit as a single-value string enum.
      return { type: "string", enum: [quasis.map((q) => q.value.cooked ?? "").join("")] };
    }
    const groups: string[][] = [];
    for (const interpolation of types) {
      const resolved = this.enumerateTemplateLiteralType(interpolation);
      if (!resolved) return null;
      groups.push(resolved);
    }
    const staticParts = quasis.map((q) => q.value.cooked ?? "");
    let combinations: string[] = [staticParts[0] ?? ""];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;
      const next: string[] = [];
      for (const prefix of combinations) {
        for (const insert of group) {
          next.push(`${prefix}${insert}${staticParts[i + 1] ?? ""}`);
        }
      }
      combinations = next;
    }
    return { type: "string", enum: combinations };
  }

  private tryBuildTemplateLiteralPattern(node: t.TSTemplateLiteralType): string | null {
    const { quasis, types } = node;
    const parts: string[] = [];
    const escapeRegex = (source: string) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (let i = 0; i < quasis.length; i++) {
      const quasi = quasis[i];
      if (!quasi) continue;
      parts.push(escapeRegex(quasi.value.cooked ?? ""));
      if (i < types.length) {
        const interpolation = types[i];
        if (!interpolation) return null;
        if (
          t.isTSStringKeyword(interpolation) ||
          (t.isTSTypeReference(interpolation) &&
            t.isIdentifier(interpolation.typeName, { name: "Uppercase" }))
        ) {
          parts.push(".+");
        } else if (t.isTSNumberKeyword(interpolation)) {
          parts.push("\\d+");
        } else {
          return null;
        }
      }
    }
    return `^${parts.join("")}$`;
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
      if (target && !t.isNode?.(target as any)) {
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
      t.isTSMappedType(node) ||
      t.isTSTemplateLiteralType(node) ||
      t.isTSImportType(node) ||
      (t.isTSTypeOperator(node) && node.operator === "keyof")
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
    if (!node) return { type: "object" }; // Default type for undefined/null

    if (t.isTSStringKeyword(node)) return { type: "string" };
    if (t.isTSNumberKeyword(node)) return { type: "number" };
    if (t.isTSBooleanKeyword(node)) return { type: "boolean" };
    if (t.isTSBigIntKeyword(node)) return { type: "integer", format: "int64" };
    if (t.isTSSymbolKeyword(node)) return { type: "string" };
    if (t.isTSObjectKeyword(node)) return { type: "object", additionalProperties: true };
    if (t.isTSNeverKeyword(node)) return { not: {} };
    // `any` / `unknown` mean "literally any value" — the empty JSON Schema (`{}`) is the
    // exact representation. Emitting `{ type: "object" }` was wrong for scalar values.
    if (t.isTSAnyKeyword(node) || t.isTSUnknownKeyword(node)) return {};
    if (t.isTSVoidKeyword(node) || t.isTSNullKeyword(node) || t.isTSUndefinedKeyword(node))
      return { type: "null" };
    if (this.isDateNode(node)) return { type: "string", format: "date-time" };
    if (this.isBinaryNode(node)) return { type: "string", format: "binary" };

    // Handle literal types like "admin" | "member" | "guest"
    if (t.isTSLiteralType(node)) {
      if (t.isStringLiteral(node.literal)) {
        return {
          type: "string",
          enum: [node.literal.value],
        };
      } else if (t.isNumericLiteral(node.literal)) {
        return {
          type: "number",
          enum: [node.literal.value],
        };
      } else if (t.isBooleanLiteral(node.literal)) {
        return {
          type: "boolean",
          enum: [node.literal.value],
        };
      } else if (t.isTemplateLiteral(node.literal)) {
        // Babel sometimes represents template-literal types as `TSLiteralType`
        // wrapping a regular `TemplateLiteral`. Reuse the enumeration helpers
        // by translating to the TS-specific shape expected by them.
        const template = node.literal;
        const synthetic = {
          type: "TSTemplateLiteralType",
          quasis: template.quasis,
          types: template.expressions,
        } as unknown as t.TSTemplateLiteralType;
        const literalEnum = this.tryResolveTemplateLiteralEnum(synthetic);
        if (literalEnum) return literalEnum;
        const pattern = this.tryBuildTemplateLiteralPattern(synthetic);
        return pattern ? { type: "string", pattern } : { type: "string" };
      }
    }

    // Handle TSExpressionWithTypeArguments (used in interface extends)
    if (t.isTSExpressionWithTypeArguments(node)) {
      if (t.isIdentifier(node.expression)) {
        // Convert to TSTypeReference-like structure for processing
        const syntheticNode = {
          type: "TSTypeReference",
          typeName: node.expression,
          typeParameters: node.typeParameters,
        };

        return this.resolveTSNodeType(syntheticNode);
      }
    }

    // Handle indexed access types: SomeType[0] or SomeType["key"]
    if (t.isTSIndexedAccessType(node)) {
      const objectType = this.resolveTSNodeType(node.objectType);
      const indexType = node.indexType;

      // Handle numeric index: Parameters<typeof func>[0]
      if (t.isTSLiteralType(indexType) && t.isNumericLiteral(indexType.literal)) {
        const index = indexType.literal.value;

        // If objectType is a tuple (has prefixItems), get the specific item
        if (objectType.prefixItems && Array.isArray(objectType.prefixItems)) {
          const tupleItem = objectType.prefixItems[index];
          if (tupleItem) {
            return tupleItem;
          }

          logger.warn(`Index ${index} is out of bounds for tuple type.`);
          return { type: "object" };
        }

        // If objectType is a regular array, return the items type
        if (
          objectType.type === "array" &&
          objectType.items &&
          typeof objectType.items === "object"
        ) {
          return objectType.items;
        }
      }

      // Handle string index: SomeType["propertyName"]
      if (t.isTSLiteralType(indexType) && t.isStringLiteral(indexType.literal)) {
        const key = indexType.literal.value;

        // If objectType has properties, get the specific property
        if (objectType.properties && objectType.properties[key]) {
          return objectType.properties[key];
        }
      }

      // Fallback
      return { type: "object" };
    }

    if (t.isTSTemplateLiteralType(node)) {
      // When all interpolated types are unions of string/number literal types, we can
      // materialise the full cartesian product as an enum. Otherwise emit a pattern based
      // on the template shape (or just `type: "string"` as a last resort).
      const literalEnum = this.tryResolveTemplateLiteralEnum(node);
      if (literalEnum) return literalEnum;
      const pattern = this.tryBuildTemplateLiteralPattern(node);
      return pattern ? { type: "string", pattern } : { type: "string" };
    }

    if (t.isTSConditionalType(node)) {
      return this.areTypesStaticallyCompatible(node.checkType, node.extendsType)
        ? this.resolveTSNodeType(node.trueType)
        : this.resolveTSNodeType(node.falseType);
    }

    if (t.isTSMappedType(node)) {
      const constraint = node.typeParameter.constraint;
      const keys = this.extractKeysFromTypeNode(constraint);
      if (keys.length === 0) {
        return { type: "object", properties: {} };
      }

      const valueType = node.typeAnnotation
        ? this.resolveTSNodeType(node.typeAnnotation)
        : { type: "object" };
      const properties = Object.fromEntries(keys.map((key) => [key, structuredClone(valueType)]));
      return {
        type: "object",
        properties,
        required: keys,
      };
    }

    if (t.isTSImportType(node)) {
      if (
        t.isStringLiteral(node.argument) &&
        node.qualifier &&
        t.isIdentifier(node.qualifier) &&
        this.currentFilePath
      ) {
        const resolvedImportPath = this.resolveImportPath(
          node.argument.value,
          this.currentFilePath,
        );
        if (resolvedImportPath) {
          this.processSchemaFile(resolvedImportPath, node.qualifier.name);
          const importedDefinition = this.typeDefinitions[node.qualifier.name];
          if (importedDefinition) {
            return this.resolveType(node.qualifier.name);
          }
        }
      }

      return { type: "object" };
    }

    if (t.isTSTypeOperator(node) && node.operator === "keyof") {
      // For `keyof` on a `$ref` target, follow the ref to the underlying definition to
      // compute the key list (the ref target hasn't had its properties copied onto the
      // schema yet).
      const sourceSchema = this.resolveTSNodeType(node.typeAnnotation);
      const resolved = this.unwrapSchemaProperties(sourceSchema);
      if (resolved) {
        return { type: "string", enum: Object.keys(resolved) };
      }
      return { type: "string" };
    }

    if (t.isTSTypeOperator(node) && node.operator === "readonly") {
      // `readonly T[]` / `readonly [A, B]` — emit the underlying schema with `readOnly: true`.
      const inner = this.resolveTSNodeType(node.typeAnnotation);
      return { ...inner, readOnly: true };
    }

    if (t.isTSTypeOperator(node) && node.operator === "unique") {
      // `unique symbol` — not expressible in OpenAPI; emit the underlying schema.
      return this.resolveTSNodeType(node.typeAnnotation);
    }

    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const typeName = node.typeName.name;

      // Special handling for built-in types
      if (typeName === "Date") {
        return { type: "string", format: "date-time" };
      }

      // Handle Promise<T> / Awaited<T> — unwrap to the resolved value.
      if (typeName === "Promise" || typeName === "Awaited") {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return this.resolveTSNodeType(node.typeParameters.params[0]);
        }
        return {};
      }

      if (typeName === "Array" || typeName === "ReadonlyArray") {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return {
            type: "array",
            items: this.resolveTSNodeType(node.typeParameters.params[0]),
          };
        }
        // Unknown element type — emit `type: "array"` without forcing `items: {type: object}`.
        return { type: "array" };
      }

      if (typeName === "Record") {
        if (node.typeParameters && node.typeParameters.params.length > 1) {
          const keyType = this.resolveTSNodeType(node.typeParameters.params[0]);
          const valueType = this.resolveTSNodeType(node.typeParameters.params[1]);

          const schema: OpenAPIDefinition = {
            type: "object",
            additionalProperties: valueType,
          };
          // If the key is a non-trivial schema (e.g. a pattern or literal union), surface it
          // as `propertyNames` so consumers can discover the shape of allowed keys.
          if (keyType && typeof keyType === "object" && keyType.type !== undefined) {
            const isTrivialStringKey =
              keyType.type === "string" && !keyType.enum && !keyType.pattern && !keyType.format;
            if (!isTrivialStringKey) schema.propertyNames = keyType;
          }
          return schema;
        }
        // Missing the value type — `Record<K>` is a TS error, but avoid emitting an
        // over-specific additionalProperties: true silently.
        logger.debug(
          `Record<...> used with ${node.typeParameters?.params.length ?? 0} type parameters; expected 2`,
        );
        return { type: "object", additionalProperties: true };
      }

      // When the original type name is hidden behind an `@id` alias and the
      // aliased schema has already been resolved, emit a `$ref` to the alias
      // instead of falling through to `resolveUtilityTypeReference` which would
      // inline the type. This preserves cross-type references like
      // `type Response = { audio: AudioInterface }` when `AudioInterface`
      // carries an `@id Audio` override.
      if (
        (!node.typeParameters || node.typeParameters.params.length === 0) &&
        this.schemaIdAliases[typeName] &&
        this.openapiDefinitions[this.schemaIdAliases[typeName]!]
      ) {
        return { $ref: `#/components/schemas/${this.schemaIdAliases[typeName]}` };
      }

      const utilityType = resolveUtilityTypeReference(node, {
        currentFilePath: this.currentFilePath,
        contentType: this.contentType,
        importMap: this.importMap,
        typeDefinitions: this.typeDefinitions,
        fileAccess: this.fileAccess,
        symbolResolver: this.symbolResolver,
        resolveImportPath: (importPath, fromFilePath) =>
          this.resolveImportPath(importPath, fromFilePath),
        resolveTSNodeType: (currentNode) => this.resolveTSNodeType(currentNode),
        findSchemaDefinition: (schemaName, contentType) =>
          this.findSchemaDefinition(schemaName, contentType),
        collectImports: (ast, filePath) => this.collectImports(ast, filePath),
        collectTypeDefinitions: (ast, schemaName, filePath) =>
          this.collectTypeDefinitions(ast, schemaName, filePath),
        collectAllExportedDefinitions: (ast, filePath) =>
          this.collectAllExportedDefinitions(ast, filePath),
        extractFunctionReturnType: (funcNode) => this.extractFunctionReturnType(funcNode),
        extractFunctionParameters: (funcNode) => this.extractFunctionParameters(funcNode),
        extractKeysFromLiteralType: (currentNode) => this.extractKeysFromLiteralType(currentNode),
        resolveGenericType: (definition, params, currentTypeName) =>
          this.resolveGenericType(definition, params, currentTypeName),
        processingTypes: this.processingTypes,
        findTypeDefinition: (schemaName) => {
          this.findSchemaDefinition(schemaName, this.contentType);
        },
        resolveType: (schemaName) => this.resolveType(schemaName),
        setResolvingPickOmitBase: (value) => {
          this.isResolvingPickOmitBase = value;
        },
      });
      if (utilityType) {
        return utilityType;
      }
    }

    if (t.isTSArrayType(node)) {
      return {
        type: "array",
        items: this.resolveTSNodeType(node.elementType),
      };
    }

    if (t.isTSTupleType(node)) {
      // Walk tuple members, unwrapping `TSNamedTupleMember` and handling a trailing
      // `TSRestType` by turning it into an unbounded `items` schema.
      const prefixItems: OpenAPIDefinition[] = [];
      let restItems: OpenAPIDefinition | null = null;
      let minItems = 0;
      for (const element of node.elementTypes) {
        const unwrapped = t.isTSNamedTupleMember(element) ? element.elementType : element;
        if (t.isTSRestType(unwrapped)) {
          const inner = unwrapped.typeAnnotation;
          restItems = t.isTSArrayType(inner)
            ? this.resolveTSNodeType(inner.elementType)
            : this.resolveTSNodeType(inner);
          break;
        }
        const optional =
          (t.isTSNamedTupleMember(element) && element.optional === true) ||
          t.isTSOptionalType(unwrapped);
        const actualNode = t.isTSOptionalType(unwrapped) ? unwrapped.typeAnnotation : unwrapped;
        prefixItems.push(this.resolveTSNodeType(actualNode));
        if (!optional) minItems++;
      }
      if (restItems !== null) {
        return {
          type: "array",
          ...(prefixItems.length > 0 ? { prefixItems } : {}),
          items: restItems,
          minItems: prefixItems.length - (prefixItems.length - minItems),
        };
      }
      return {
        type: "array",
        prefixItems,
        items: false,
        minItems,
        maxItems: prefixItems.length,
      };
    }

    if (t.isTSFunctionType(node) || t.isTSConstructorType(node)) {
      // Functions / constructors are not transportable — describe as empty schema.
      return {};
    }

    if (t.isTSTypeLiteral(node)) {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      let additionalProperties: OpenAPIDefinition | boolean | undefined;
      node.members.forEach((member: any) => {
        if (t.isTSPropertySignature(member)) {
          const key = member.key;
          const propName = t.isIdentifier(key)
            ? key.name
            : t.isStringLiteral(key)
              ? key.value
              : null;
          if (!propName) return;
          const property = {
            ...this.resolveTSNodeType(member.typeAnnotation?.typeAnnotation),
            ...this.getPropertyOptions(member),
          };
          // `readonly foo: string` — surface it in the emitted schema.
          if (member.readonly === true) property.readOnly = true;
          // Allow property-level `@openapi-override { ... }` JSDoc to merge raw OpenAPI into
          // the resolved schema — the explicit escape hatch for anything we can't infer.
          applyPropertyOpenApiOverride(member, property);
          properties[propName] = property;
          if (!member.optional) {
            required.push(propName);
          }
          return;
        }
        if (t.isTSIndexSignature(member)) {
          // `{ [key: string]: Value }` — describe as additionalProperties.
          const valueType = member.typeAnnotation?.typeAnnotation
            ? this.resolveTSNodeType(member.typeAnnotation.typeAnnotation)
            : true;
          additionalProperties = valueType as OpenAPIDefinition | boolean;
        }
      });
      const result: OpenAPIDefinition = { type: "object", properties };
      if (required.length > 0) result.required = required;
      if (additionalProperties !== undefined) result.additionalProperties = additionalProperties;
      return result;
    }

    if (t.isTSUnionType(node)) {
      // Split null/undefined/void "nullable" markers from the real members so we
      // can attach `nullable: true` to whatever shape we emit below.
      const isNullish = (type: any) =>
        t.isTSNullKeyword(type) || t.isTSUndefinedKeyword(type) || t.isTSVoidKeyword(type);
      const nullable = node.types.some((type: any) => t.isTSNullKeyword(type));
      const nonNullableTypes = node.types.filter((type: any) => !isNullish(type));

      // Collapse homogeneous literal unions into `{ type, enum }` — this works
      // even when the original union mixes in `null`/`undefined` thanks to the
      // filtering above.
      const allLiterals =
        nonNullableTypes.length > 0 &&
        nonNullableTypes.every((type: any) => t.isTSLiteralType(type));
      if (allLiterals) {
        const enumValues = nonNullableTypes
          .map((type: any) => {
            if (t.isTSLiteralType(type)) {
              const literal = type.literal;
              if (t.isStringLiteral(literal)) return literal.value;
              if (t.isNumericLiteral(literal)) return literal.value;
              if (t.isBooleanLiteral(literal)) return literal.value;
            }
            return null;
          })
          .filter((value: any) => value !== null);
        if (enumValues.length > 0) {
          const firstType = typeof enumValues[0];
          const sameType = enumValues.every((val: any) => typeof val === firstType);
          if (sameType) {
            const out: OpenAPIDefinition = { type: firstType, enum: enumValues };
            if (nullable) out.nullable = true;
            return out;
          }
        }
      }

      // Single non-nullable member + nullable marker → `{ ...member, nullable: true }`.
      if (nullable && nonNullableTypes.length === 1) {
        const mainType = this.resolveTSNodeType(nonNullableTypes[0]);
        return { ...mainType, nullable: true };
      }

      // Single non-nullable member, nullish marker was `undefined`/`void` → pass through.
      if (!nullable && nonNullableTypes.length === 1) {
        return this.resolveTSNodeType(nonNullableTypes[0]);
      }

      // Fallback: standard oneOf, skipping null/undefined/void members.
      const oneOf = nonNullableTypes.map((subNode: any) => this.resolveTSNodeType(subNode));
      const out: OpenAPIDefinition = { oneOf };
      if (nullable) out.nullable = true;
      return out;
    }

    if (t.isTSIntersectionType(node)) {
      // For intersection types, we combine properties
      const allProperties: Record<string, any> = {};
      const requiredProperties: string[] = [];

      node.types.forEach((typeNode: any) => {
        const resolvedType = this.resolveTSNodeType(typeNode);
        if (resolvedType.type === "object" && resolvedType.properties) {
          Object.entries(resolvedType.properties).forEach(([key, value]) => {
            allProperties[key] = value;
          });
          resolvedType.required?.forEach((key) => {
            if (!requiredProperties.includes(key)) {
              requiredProperties.push(key);
            }
          });
        }
      });

      return requiredProperties.length > 0
        ? {
            type: "object",
            properties: allProperties,
            required: requiredProperties,
          }
        : {
            type: "object",
            properties: allProperties,
          };
    }

    // Case where a type is a reference to another defined type
    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const refName = node.typeName.name;
      const aliasedName = this.schemaIdAliases[refName] ?? refName;
      return { $ref: `#/components/schemas/${aliasedName}` };
    }

    logger.debug("Unrecognized TypeScript type node:", node);
    return { type: "object" }; // By default we return an object
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

  private extractKeysFromLiteralType(node: any): string[] {
    return extractKeysFromLiteralType(node);
  }

  private getPropertyOptions(node: any): PropertyOptions {
    return getPropertyOptions(node, this.contentType);
  }

  /**
   * Generate example values based on parameter type and name
   */
  public getExampleForParam(paramName: string, type: string = "string"): any {
    return getExampleForParam(paramName, type);
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
    return createRequestBodySchema(body, undefined, "multipart/form-data").content[
      "multipart/form-data"
    ]?.schema as OpenAPIDefinition;
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
    return getSchemaContent(
      { tag, paramsType, querystringType, pathParamsType, bodyType, responseType },
      {
        openapiDefinitions: this.openapiDefinitions,
        schemaTypes: this.schemaTypes,
        findSchemaDefinition: (schemaName, contentType) =>
          this.findSchemaDefinition(schemaName, contentType as ContentType),
      },
    );
  }

  public ensureSchemaResolved(typeName: string, contentType: ContentType = "response"): void {
    let baseTypeName = typeName.trim();
    while (baseTypeName.endsWith("[]")) {
      baseTypeName = baseTypeName.slice(0, -2);
    }

    if (!baseTypeName || baseTypeName.startsWith("{") || baseTypeName.startsWith("[")) {
      return;
    }

    if (!this.openapiDefinitions[baseTypeName]) {
      this.findSchemaDefinition(baseTypeName, contentType);
    }
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
    // Parse the generic type string
    const parsed = parseGenericTypeString(genericTypeString);
    if (!parsed) {
      return {};
    }

    const { baseTypeName, typeArguments } = parsed;

    // Find the base generic type definition
    this.scanAllSchemaDirs(baseTypeName);
    const genericDefEntry = this.typeDefinitions[baseTypeName];
    const genericTypeDefinition = genericDefEntry?.node || genericDefEntry;

    if (!genericTypeDefinition) {
      logger.debug(`Generic type definition not found for: ${baseTypeName}`);
      return {};
    }

    // Also find all the type argument definitions
    typeArguments.forEach((argTypeName: string) => {
      // If it's a simple type reference (not another generic), find its definition
      if (!argTypeName.includes("<") && !this.isGenericTypeParameter(argTypeName)) {
        this.scanAllSchemaDirs(argTypeName);
      }
    });

    // Create AST nodes for the type arguments by parsing them
    const typeArgumentNodes = typeArguments.map((arg: string) =>
      createTypeReferenceFromString(arg),
    );

    // Resolve the generic type
    const resolved = this.resolveGenericType(
      genericTypeDefinition,
      typeArgumentNodes,
      baseTypeName,
    );

    // Cache the resolved type for future reference
    this.openapiDefinitions[genericTypeString] = resolved;

    return resolved;
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
   * Parse a generic type string into base type and arguments
   * @param genericTypeString - The string like "MyApiSuccessResponseBody<LLMSResponse>"
   * @returns Object with baseTypeName and typeArguments array
   */
  private parseGenericTypeString(
    genericTypeString: string,
  ): { baseTypeName: string; typeArguments: string[] } | null {
    return parseGenericTypeString(genericTypeString);
  }

  /**
   * Split type arguments by comma, handling nested generics correctly
   * @param typeArgsString - The string inside angle brackets
   * @returns Array of individual type argument strings
   */
  private splitTypeArguments(typeArgsString: string): string[] {
    return splitGenericTypeArguments(typeArgsString);
  }

  /**
   * Create a TypeScript AST node from a type string
   * @param typeString - The type string like "LLMSResponse"
   * @returns A TypeScript AST node
   */
  private createTypeNodeFromString(typeString: string): any {
    return createTypeReferenceFromString(typeString);
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
    _typeName: string,
  ): OpenAPIDefinition {
    // Extract type parameters from the generic type definition
    let typeParameters: string[] = [];
    let bodyToResolve: any = null;

    // Handle type alias declarations
    if (t.isTSTypeAliasDeclaration(genericTypeDefinition)) {
      if (genericTypeDefinition.typeParameters && genericTypeDefinition.typeParameters.params) {
        typeParameters = genericTypeDefinition.typeParameters.params.map((param: any) => {
          if (t.isTSTypeParameter(param)) {
            return param.name;
          }
          return t.isIdentifier(param) ? param.name : param.name?.name || param;
        });
      }
      bodyToResolve = genericTypeDefinition.typeAnnotation;
    }

    // Handle interface declarations
    if (t.isTSInterfaceDeclaration(genericTypeDefinition)) {
      if (genericTypeDefinition.typeParameters && genericTypeDefinition.typeParameters.params) {
        typeParameters = genericTypeDefinition.typeParameters.params.map((param: any) => {
          if (t.isTSTypeParameter(param)) {
            return param.name;
          }
          return t.isIdentifier(param) ? param.name : param.name?.name || param;
        });
      }
      bodyToResolve = genericTypeDefinition.body;
    }

    if (!bodyToResolve) {
      return {};
    }

    // Create a mapping from type parameters to actual types
    const typeParameterMap: Record<string, any> = {};
    typeParameters.forEach((param: string, index: number) => {
      if (index < typeArguments.length) {
        typeParameterMap[param] = typeArguments[index];
      }
    });

    // Resolve the type annotation with substituted type parameters
    return this.resolveTypeWithSubstitution(bodyToResolve, typeParameterMap);
  }

  /**
   * Resolve a type node with type parameter substitution
   * @param node - The AST node to resolve
   * @param typeParameterMap - Mapping from type parameter names to actual types
   * @returns The resolved OpenAPI schema
   */
  private resolveTypeWithSubstitution(
    node: any,
    typeParameterMap: Record<string, any>,
  ): OpenAPIDefinition {
    if (!node) return { type: "object" };

    // If this is a type parameter reference, substitute it
    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const paramName = node.typeName.name;
      if (typeParameterMap[paramName]) {
        // The mapped value is an AST node, resolve it
        const mappedNode = typeParameterMap[paramName];
        if (t.isTSTypeReference(mappedNode) && t.isIdentifier(mappedNode.typeName)) {
          // If it's a reference to another type, get the resolved schema from openapiDefinitions
          const referencedTypeName = mappedNode.typeName.name;
          if (this.openapiDefinitions[referencedTypeName]) {
            return this.openapiDefinitions[referencedTypeName];
          }
          // If not in openapiDefinitions, try to resolve it
          this.findSchemaDefinition(referencedTypeName, this.contentType);
          return this.openapiDefinitions[referencedTypeName] || {};
        }
        return this.resolveTSNodeType(typeParameterMap[paramName]);
      }
    }

    if (t.isTSArrayType(node)) {
      return {
        type: "array",
        items: this.resolveTypeWithSubstitution(node.elementType, typeParameterMap),
      };
    }

    // Handle intersection types (e.g., T & { success: true })
    if (t.isTSIntersectionType(node)) {
      const allProperties: Record<string, any> = {};
      const requiredProperties: string[] = [];

      node.types.forEach((typeNode: any, _index: number) => {
        let resolvedType: OpenAPIDefinition;

        // Check if this is a type parameter reference
        if (t.isTSTypeReference(typeNode) && t.isIdentifier(typeNode.typeName)) {
          const paramName = typeNode.typeName.name;

          if (typeParameterMap[paramName]) {
            const mappedNode = typeParameterMap[paramName];
            if (t.isTSTypeReference(mappedNode) && t.isIdentifier(mappedNode.typeName)) {
              // If it's a reference to another type, get the resolved schema
              const referencedTypeName = mappedNode.typeName.name;

              if (this.openapiDefinitions[referencedTypeName]) {
                resolvedType = this.openapiDefinitions[referencedTypeName];
              } else {
                // If not in openapiDefinitions, try to resolve it
                this.findSchemaDefinition(referencedTypeName, this.contentType);
                resolvedType = this.openapiDefinitions[referencedTypeName] || {};
              }
            } else {
              resolvedType = this.resolveTSNodeType(mappedNode);
            }
          } else {
            resolvedType = this.resolveTSNodeType(typeNode);
          }
        } else {
          resolvedType = this.resolveTypeWithSubstitution(typeNode, typeParameterMap);
        }

        if (resolvedType.type === "object" && resolvedType.properties) {
          Object.entries(resolvedType.properties).forEach(([key, value]: [string, any]) => {
            allProperties[key] = value;
          });
          resolvedType.required?.forEach((key) => {
            if (!requiredProperties.includes(key)) {
              requiredProperties.push(key);
            }
          });
        }
      });

      return requiredProperties.length > 0
        ? {
            type: "object",
            properties: allProperties,
            required: requiredProperties,
          }
        : {
            type: "object",
            properties: allProperties,
          };
    }

    // For other types, use the standard resolution but with parameter substitution
    if (t.isTSTypeLiteral(node)) {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      node.members.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = {
            ...this.resolveTypeWithSubstitution(
              member.typeAnnotation?.typeAnnotation,
              typeParameterMap,
            ),
            ...this.getPropertyOptions(member),
          };
          if (!member.optional) {
            required.push(propName);
          }
        }
      });
      return required.length > 0
        ? { type: "object", properties, required }
        : { type: "object", properties };
    }

    // Handle interface body (from generic interfaces)
    if (t.isTSInterfaceBody(node)) {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      node.body.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = {
            ...this.resolveTypeWithSubstitution(
              member.typeAnnotation?.typeAnnotation,
              typeParameterMap,
            ),
            ...this.getPropertyOptions(member),
          };
          if (!member.optional) {
            required.push(propName);
          }
        }
      });
      return required.length > 0
        ? { type: "object", properties, required }
        : { type: "object", properties };
    }

    // Fallback to standard type resolution
    return this.resolveTSNodeType(node);
  }

  /**
   * Extracts the return type annotation from a function AST node
   * @param funcNode - Function declaration or arrow function AST node
   * @returns The return type annotation node, or null if not found
   */
  private extractFunctionReturnType(funcNode: any): any | null {
    return extractFunctionReturnType(funcNode);
  }

  /**
   * Extracts parameter nodes from a function AST node
   * @param funcNode - Function declaration or arrow function AST node
   * @returns Array of parameter nodes
   */
  private extractFunctionParameters(funcNode: any): any[] {
    return extractFunctionParameters(funcNode);
  }
}

function applyPropertyOpenApiOverride(member: any, property: Record<string, any>): void {
  const leadingComments: any[] | undefined = member?.leadingComments;
  if (!leadingComments || leadingComments.length === 0) return;
  for (const comment of leadingComments) {
    const override = parseOpenApiOverrideTag(comment.value ?? "");
    if (override) {
      Object.assign(property, override);
    }
  }
}
