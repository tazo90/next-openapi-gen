import fs from "fs";
import path from "path";
import * as t from "@babel/types";

import { processCustomSchemaFiles } from "../core/custom-schema-file-processor.js";
import { CustomSchemaProcessor } from "../core/custom-schema-processor.js";
import { mergeSchemaDefinitionLayers } from "../core/schema-definition-processor.js";
import { parseTypeScriptFile } from "../../shared/utils.js";
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
  collectTypeDefinitions,
  resolveImportPath,
} from "./schema-discovery.js";
import { extractFunctionParameters, extractFunctionReturnType } from "./function-nodes.js";
import { resolveUtilityTypeReference } from "./utility-types.js";
import type {
  ContentType,
  OpenAPIDefinition,
  ParamSchema,
  PropertyOptions,
  SchemaType,
} from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export type SchemaProcessorFileAccess = Pick<
  typeof fs,
  "existsSync" | "readdirSync" | "statSync" | "readFileSync"
>;

const defaultFileAccess: SchemaProcessorFileAccess = fs;
export { createTypeReferenceFromString, parseGenericTypeString, splitGenericTypeArguments };

export class SchemaProcessor {
  private schemaDirs: string[];
  private typeDefinitions: Record<string, any> = {};
  private openapiDefinitions: Record<string, OpenAPIDefinition> = {};
  private contentType: ContentType = "";
  private customSchemaProcessor: CustomSchemaProcessor;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processSchemaTracker: Record<string, boolean> = {};
  private processingTypes: Set<string> = new Set();

  private zodSchemaConverter: ZodSchemaConverter | null = null;
  private zodSchemaProcessor: ZodSchemaProcessor | null = null;
  private schemaTypes: SchemaType[];
  private isResolvingPickOmitBase: boolean = false;
  private readonly fileAccess: SchemaProcessorFileAccess;

  // Track imports per file for resolving ReturnType<typeof func>
  private importMap: Record<string, Record<string, string>> = {}; // { filePath: { importName: importPath } }
  private currentFilePath: string = ""; // Track the file being processed

  constructor(
    schemaDir: string | string[],
    schemaType: SchemaType | SchemaType[] = "typescript",
    schemaFiles?: string[],
    apiDir?: string,
    fileAccess: SchemaProcessorFileAccess = defaultFileAccess,
  ) {
    this.schemaDirs = normalizeSchemaDirs(schemaDir).map((d) => path.resolve(d));
    this.schemaTypes = normalizeSchemaTypes(schemaType);
    this.fileAccess = fileAccess;
    this.customSchemaProcessor = new CustomSchemaProcessor(
      schemaFiles && schemaFiles.length > 0 ? processCustomSchemaFiles(schemaFiles) : {},
    );

    // Initialize Zod converter if Zod is enabled
    if (this.schemaTypes.includes("zod")) {
      this.zodSchemaConverter = new ZodSchemaConverter(schemaDir, apiDir);
      this.zodSchemaProcessor = new ZodSchemaProcessor(this.zodSchemaConverter);
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
        !this.isGenericTypeParameter(key) &&
        !this.isInvalidSchemaName(key) &&
        !this.isBuiltInUtilityType(key) &&
        !this.isFunctionSchema(key)
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

  public findSchemaDefinition(schemaName: string, contentType: ContentType): OpenAPIDefinition {
    // Assign type that is actually processed
    this.contentType = contentType;

    // Check if the schemaName is a generic type (contains < and >)
    if (schemaName.includes("<") && schemaName.includes(">")) {
      return this.resolveGenericTypeFromString(schemaName);
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
      const zodSchema = this.zodSchemaProcessor.resolveSchema(schemaName);
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
    for (const dir of this.schemaDirs) {
      if (!this.fileAccess.existsSync(dir)) {
        logger.warn(`Schema directory not found: ${dir}`);
        continue;
      }
      this.scanSchemaDir(dir, schemaName);
    }
  }

  private scanSchemaDir(dir: string, schemaName: string) {
    let files = this.directoryCache[dir];
    if (typeof files === "undefined") {
      files = this.fileAccess.readdirSync(dir);
      this.directoryCache[dir] = files;
    }

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      let stat = this.statCache[filePath];
      if (typeof stat === "undefined") {
        stat = this.fileAccess.statSync(filePath);
        this.statCache[filePath] = stat;
      }

      if (stat.isDirectory()) {
        this.scanSchemaDir(filePath, schemaName);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        this.processSchemaFile(filePath, schemaName);
      }
    });
  }

  private collectImports(ast: t.File, filePath: string): void {
    collectImports(ast, filePath, this.importMap);
  }

  /**
   * Resolve an import path relative to the current file
   * Converts import paths like "../app/api/products/route.utils" to absolute file paths
   */
  private resolveImportPath(importPath: string, fromFilePath: string): string | null {
    return resolveImportPath(importPath, fromFilePath, this.fileAccess);
  }

  /**
   * Collect all exported type definitions from an AST without filtering by name
   * Used when processing imported files to ensure all referenced types are available
   */
  private collectAllExportedDefinitions(ast: any, filePath?: string): void {
    collectAllExportedDefinitions(ast, this.typeDefinitions, filePath || this.currentFilePath);
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
        const zodSchema = this.zodSchemaConverter.convertZodSchemaToOpenApi(typeName);
        if (zodSchema) {
          this.openapiDefinitions[typeName] = zodSchema;
          return zodSchema;
        }
      }

      const typeDefEntry = this.typeDefinitions[typeName.toString()];
      if (!typeDefEntry) return {};
      const typeNode = typeDefEntry.node || typeDefEntry; // Support both old and new format

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

              properties[propName] = property;
            }
          });
        }

        return { type: "object", properties };
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

      return {};
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

  private resolveTSNodeType(node: any): OpenAPIDefinition {
    if (!node) return { type: "object" }; // Default type for undefined/null

    if (t.isTSStringKeyword(node)) return { type: "string" };
    if (t.isTSNumberKeyword(node)) return { type: "number" };
    if (t.isTSBooleanKeyword(node)) return { type: "boolean" };
    if (t.isTSAnyKeyword(node) || t.isTSUnknownKeyword(node)) return { type: "object" };
    if (t.isTSVoidKeyword(node) || t.isTSNullKeyword(node) || t.isTSUndefinedKeyword(node))
      return { type: "null" };
    if (this.isDateNode(node)) return { type: "string", format: "date-time" };

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

    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const typeName = node.typeName.name;

      // Special handling for built-in types
      if (typeName === "Date") {
        return { type: "string", format: "date-time" };
      }

      // Handle Promise<T> - in OpenAPI, promises are transparent (we document the resolved value)
      if (typeName === "Promise") {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          // Return the inner type directly - promises are async wrappers
          return this.resolveTSNodeType(node.typeParameters.params[0]);
        }
        return { type: "object" }; // Promise with no type parameter
      }

      if (typeName === "Array" || typeName === "ReadonlyArray") {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return {
            type: "array",
            items: this.resolveTSNodeType(node.typeParameters.params[0]),
          };
        }
        return { type: "array", items: { type: "object" } };
      }

      if (typeName === "Record") {
        if (node.typeParameters && node.typeParameters.params.length > 1) {
          const _keyType = this.resolveTSNodeType(node.typeParameters.params[0]);
          const valueType = this.resolveTSNodeType(node.typeParameters.params[1]);

          return {
            type: "object",
            additionalProperties: valueType,
          };
        }
        return { type: "object", additionalProperties: true };
      }

      const utilityType = resolveUtilityTypeReference(node, {
        currentFilePath: this.currentFilePath,
        contentType: this.contentType,
        importMap: this.importMap,
        typeDefinitions: this.typeDefinitions,
        fileAccess: this.fileAccess,
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

    if (t.isTSTypeLiteral(node)) {
      const properties: Record<string, any> = {};
      node.members.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = this.resolveTSNodeType(member.typeAnnotation?.typeAnnotation);
        }
      });
      return { type: "object", properties };
    }

    if (t.isTSUnionType(node)) {
      // Handle union types with literal types, like "admin" | "member" | "guest"
      const literals = node.types.filter((type: any) => t.isTSLiteralType(type));

      // Check if all union elements are literals
      if (literals.length === node.types.length) {
        // All union members are literals, convert to enum
        const enumValues = literals
          .map((type: any) => {
            if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) {
              return type.literal.value;
            } else if (t.isTSLiteralType(type) && t.isNumericLiteral(type.literal)) {
              return type.literal.value;
            } else if (t.isTSLiteralType(type) && t.isBooleanLiteral(type.literal)) {
              return type.literal.value;
            }
            return null;
          })
          .filter((value: any) => value !== null);

        if (enumValues.length > 0) {
          // Check if all enum values are of the same type
          const firstType = typeof enumValues[0];
          const sameType = enumValues.every((val: any) => typeof val === firstType);

          if (sameType) {
            return {
              type: firstType,
              enum: enumValues,
            };
          }
        }
      }

      // Handling null | undefined in type union
      const nullableTypes = node.types.filter(
        (type: any) =>
          t.isTSNullKeyword(type) || t.isTSUndefinedKeyword(type) || t.isTSVoidKeyword(type),
      );

      const nonNullableTypes = node.types.filter(
        (type: any) =>
          !t.isTSNullKeyword(type) && !t.isTSUndefinedKeyword(type) && !t.isTSVoidKeyword(type),
      );

      // If a type can be null/undefined, we mark it as nullable
      if (nullableTypes.length > 0 && nonNullableTypes.length === 1) {
        const mainType = this.resolveTSNodeType(nonNullableTypes[0]);
        return {
          ...mainType,
          nullable: true,
        };
      }

      // Standard union type support via oneOf
      return {
        oneOf: node.types
          .filter(
            (type: any) =>
              !t.isTSNullKeyword(type) && !t.isTSUndefinedKeyword(type) && !t.isTSVoidKeyword(type),
          )
          .map((subNode: any) => this.resolveTSNodeType(subNode)),
      };
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
            if (value.required) {
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
      return { $ref: `#/components/schemas/${node.typeName.name}` };
    }

    logger.debug("Unrecognized TypeScript type node:", node);
    return { type: "object" }; // By default we return an object
  }

  private processSchemaFile(filePath: string, schemaName: string): OpenAPIDefinition | undefined {
    // Check if the file has already been processed
    if (this.processSchemaTracker[`${filePath}-${schemaName}`]) return;

    try {
      // Recognizes different elements of TS like variable, type, interface, enum
      const content = this.fileAccess.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

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
      return { type: "object" }; // By default we return an empty object on error
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
    ].schema as OpenAPIDefinition;
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
  ): ParamSchema[] {
    return createRequestParamsSchema(params, isPathParam);
  }

  public createRequestBodySchema(
    body: OpenAPIDefinition,
    description?: string,
    contentType?: string,
  ): any {
    return createRequestBodySchema(body, description, contentType);
  }

  public createResponseSchema(responses: OpenAPIDefinition, description?: string): any {
    return createResponseSchema(responses, description);
  }

  public getSchemaContent({ tag, paramsType, pathParamsType, bodyType, responseType }: any): {
    tag: OpenAPIDefinition;
    params: OpenAPIDefinition;
    pathParams: OpenAPIDefinition;
    body: OpenAPIDefinition;
    responses: OpenAPIDefinition;
  } {
    return getSchemaContent(
      { tag, paramsType, pathParamsType, bodyType, responseType },
      {
        openapiDefinitions: this.openapiDefinitions,
        schemaTypes: this.schemaTypes,
        findSchemaDefinition: (schemaName, contentType) =>
          this.findSchemaDefinition(schemaName, contentType as ContentType),
      },
    );
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
            if (value.required) {
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
      node.members.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = this.resolveTypeWithSubstitution(
            member.typeAnnotation?.typeAnnotation,
            typeParameterMap,
          );
        }
      });
      return { type: "object", properties };
    }

    // Handle interface body (from generic interfaces)
    if (t.isTSInterfaceBody(node)) {
      const properties: Record<string, any> = {};
      node.body.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = this.resolveTypeWithSubstitution(
            member.typeAnnotation?.typeAnnotation,
            typeParameterMap,
          );
        }
      });
      return { type: "object", properties };
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
