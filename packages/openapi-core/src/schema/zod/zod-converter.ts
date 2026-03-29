import fs from "fs";
import path from "path";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { traverse } from "../../shared/babel-traverse.js";
import { parseTypeScriptFile } from "../../shared/utils.js";
import { logger } from "../../shared/logger.js";
import { DrizzleZodProcessor } from "./drizzle-zod-processor.js";
import {
  expandFactoryCall,
  extractReturnNode,
  parseFileWithCache,
  resolveImportPath,
  substituteParameters,
} from "./converter-runtime.js";
import { collectZodRouteFiles, processZodSchemaFilesInDirectory } from "./file-processor.js";
import { processImports } from "./import-processor.js";
import {
  escapeRegExp,
  extractDescriptionFromArguments,
  hasOptionalMethod,
  isOptionalCall,
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
  findFunctionInAST as findFunctionInASTHelper,
  isZodSchemaNode,
  returnsZodSchemaNode,
} from "./prescan.js";
import type { OpenApiSchema } from "../../shared/types.js";

type ZodConverterFileAccess = Pick<
  typeof fs,
  "existsSync" | "readdirSync" | "statSync" | "readFileSync"
>;

const defaultFileAccess: ZodConverterFileAccess = fs;

/**
 * Class for converting Zod schemas to OpenAPI specifications
 */
export class ZodSchemaConverter {
  schemaDirs: string[];
  apiDir: string | undefined;
  zodSchemas: Record<string, OpenApiSchema> = {};
  processingSchemas: Set<string> = new Set();
  processedModules: Set<string> = new Set();
  typeToSchemaMapping: Record<string, string> = {};
  drizzleZodImports: Set<string> = new Set();
  factoryCache: Map<string, t.Node> = new Map(); // Cache for analyzed factory functions
  factoryCheckCache: Map<string, boolean> = new Map(); // Cache for non-factory functions
  fileASTCache: Map<string, t.File> = new Map(); // Cache for parsed files
  fileImportsCache: Map<string, Record<string, string>> = new Map(); // Cache for file imports
  routeFilesCache: string[] | null = null;
  schemaFilesCache: Map<string, string[]> = new Map();
  preprocessedFiles: Set<string> = new Set();

  // Current processing context (set during file processing)
  currentFilePath?: string;
  currentAST?: t.File;
  currentImports?: Record<string, string>;
  private readonly fileAccess: ZodConverterFileAccess;

  constructor(
    schemaDir: string | string[],
    apiDir?: string,
    fileAccess: ZodConverterFileAccess = defaultFileAccess,
  ) {
    const dirs = Array.isArray(schemaDir) ? schemaDir : [schemaDir];
    this.schemaDirs = dirs.map((d) => path.resolve(d));
    this.apiDir = apiDir ? path.resolve(apiDir) : undefined;
    this.fileAccess = fileAccess;
  }

  /**
   * Find a Zod schema by name and convert it to OpenAPI spec
   */
  convertZodSchemaToOpenApi(schemaName: string): OpenApiSchema | null {
    // Run pre-scan only one time
    if (Object.keys(this.typeToSchemaMapping).length === 0) {
      this.preScanForTypeMappings();
    }

    logger.debug(`Looking for Zod schema: ${schemaName}`);

    // Check mapped types
    const mappedSchemaName = this.typeToSchemaMapping[schemaName];
    if (mappedSchemaName) {
      logger.debug(`Type '${schemaName}' is mapped to schema '${mappedSchemaName}'`);
      schemaName = mappedSchemaName;
    }

    // Check for circular references
    if (this.processingSchemas.has(schemaName)) {
      return { $ref: `#/components/schemas/${schemaName}` };
    }

    // Add to processing set
    this.processingSchemas.add(schemaName);

    try {
      // Return cached schema if it exists
      const cachedSchema = this.zodSchemas[schemaName];
      if (cachedSchema) {
        return cachedSchema;
      }

      // Find all route files and process them first
      const routeFiles = this.findRouteFiles();

      for (const routeFile of routeFiles) {
        this.processFileForZodSchema(routeFile, schemaName);

        const routeSchema = this.zodSchemas[schemaName];
        if (routeSchema) {
          logger.debug(`Found Zod schema '${schemaName}' in route file: ${routeFile}`);
          return routeSchema;
        }
      }

      // Scan schema directories
      for (const dir of this.schemaDirs) {
        this.scanDirectoryForZodSchema(dir, schemaName);
        if (this.zodSchemas[schemaName]) break;
      }

      // Return the schema if found, or null if not
      const resolvedSchema = this.zodSchemas[schemaName];
      if (resolvedSchema) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        return resolvedSchema;
      }

      logger.debug(`Could not find Zod schema: ${schemaName}`);
      return null;
    } finally {
      // Remove from processing set
      this.processingSchemas.delete(schemaName);
    }
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
          this.findRouteFilesInDir(filePath, routeFiles);
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

  /**
   * Process a file to find Zod schema definitions
   */
  processFileForZodSchema(filePath: string, schemaName: string): void {
    try {
      const content = this.fileAccess.readFileSync(filePath, "utf-8");

      // Check if file contains schema we are looking for
      if (!content.includes(schemaName)) {
        return;
      }

      // Pre-process all schemas in file
      this.preprocessAllSchemasInFile(filePath, content);

      // Return it, if the schema has already been processed during pre-processing
      if (this.zodSchemas[schemaName]) {
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
      }

      // Set current processing context for use by processZodNode during factory expansion
      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      // Look for all exported Zod schemas
      traverse(ast, {
        // For export const SchemaName = z.object({...})
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
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
                  const schema = this.processZodNode(declaration.init);
                  if (schema) {
                    this.zodSchemas[schemaName] = schema;
                  }
                }
                // Check if this is a call expression with .extend()
                else if (
                  t.isCallExpression(declaration.init) &&
                  t.isMemberExpression(declaration.init.callee) &&
                  t.isIdentifier(declaration.init.callee.property) &&
                  declaration.init.callee.property.name === "extend"
                ) {
                  const schema = this.processZodNode(declaration.init);
                  if (schema) {
                    this.zodSchemas[schemaName] = schema;
                  }
                }
                // Existing code for z.object({...})
                else if (
                  t.isCallExpression(declaration.init) &&
                  t.isMemberExpression(declaration.init.callee) &&
                  t.isIdentifier(declaration.init.callee.object) &&
                  declaration.init.callee.object.name === "z"
                ) {
                  const schema = this.processZodNode(declaration.init);
                  if (schema) {
                    this.zodSchemas[schemaName] = schema;
                  }
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
                      this.zodSchemas[schemaName] = schema;
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
          } else if (t.isTSTypeAliasDeclaration(path.node.declaration)) {
            // Handle export type aliases with z schema definitions
            if (
              t.isIdentifier(path.node.declaration.id) &&
              path.node.declaration.id.name === schemaName
            ) {
              const typeAnnotation = path.node.declaration.typeAnnotation;

              // Check if this is a reference to a z schema (e.g., export type UserSchema = z.infer<typeof UserSchema>)
              if (
                t.isTSTypeReference(typeAnnotation) &&
                t.isIdentifier(typeAnnotation.typeName) &&
                typeAnnotation.typeName.name === "z.infer"
              ) {
                // Extract the schema name from z.infer<typeof SchemaName>
                if (
                  typeAnnotation.typeParameters &&
                  typeAnnotation.typeParameters.params.length > 0 &&
                  t.isTSTypeReference(typeAnnotation.typeParameters.params[0]) &&
                  t.isTSTypeQuery(typeAnnotation.typeParameters.params[0].typeName) &&
                  t.isIdentifier(
                    // @ts-ignore
                    typeAnnotation.typeParameters.params[0].typeName.exprName,
                  )
                ) {
                  const referencedSchema =
                    // @ts-ignore
                    typeAnnotation.typeParameters.params[0].typeName.exprName.name;

                  // Look for the referenced schema in the same file
                  if (!this.zodSchemas[referencedSchema]) {
                    this.processFileForZodSchema(filePath, referencedSchema);
                  }
                }
              }
            }
          }
        },

        // For const SchemaName = z.object({...})
        VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
          if (t.isIdentifier(path.node.id) && path.node.id.name === schemaName && path.node.init) {
            // Check if this is any Zod schema (including chained calls)
            if (this.isZodSchema(path.node.init)) {
              const schema = this.processZodNode(path.node.init);
              if (schema) {
                this.zodSchemas[schemaName] = schema;
              }
              return;
            }

            // Helper function for processing the call chain
            const processChainedCall = (
              node: t.CallExpression,
              baseSchema: OpenApiSchema,
            ): OpenApiSchema => {
              if (!t.isCallExpression(node) || !t.isMemberExpression(node.callee)) {
                return baseSchema;
              }

              // @ts-ignore
              const methodName = node.callee.property.name;
              let schema = baseSchema;

              // If there is an even deeper call, process it first
              if (t.isCallExpression(node.callee.object)) {
                schema = processChainedCall(node.callee.object, baseSchema);
              }

              // Now apply the current method
              switch (methodName) {
                case "omit":
                  if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
                    node.arguments[0].properties.forEach((prop) => {
                      if (
                        t.isObjectProperty(prop) &&
                        t.isBooleanLiteral(prop.value) &&
                        prop.value.value === true
                      ) {
                        const key = t.isIdentifier(prop.key)
                          ? prop.key.name
                          : t.isStringLiteral(prop.key)
                            ? prop.key.value
                            : null;

                        if (key && schema.properties) {
                          logger.debug(`Removing property: ${key}`);
                          delete schema.properties[key];
                          if (schema.required) {
                            schema.required = schema.required.filter((r) => r !== key);
                          }
                        }
                      }
                    });
                  }
                  break;

                case "partial":
                  // All fields become optional (T | undefined), not nullable
                  if (schema.properties) {
                    delete schema.required;
                  }
                  break;

                case "pick":
                  if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
                    const keysToPick: string[] = [];
                    node.arguments[0].properties.forEach((prop) => {
                      if (
                        t.isObjectProperty(prop) &&
                        t.isBooleanLiteral(prop.value) &&
                        prop.value.value === true
                      ) {
                        const key = t.isIdentifier(prop.key)
                          ? prop.key.name
                          : t.isStringLiteral(prop.key)
                            ? prop.key.value
                            : null;
                        if (key) keysToPick.push(key);
                      }
                    });

                    // Keep only selected properties
                    if (schema.properties) {
                      const existingProperties = schema.properties;
                      const newProperties: Record<string, OpenApiSchema> = {};
                      keysToPick.forEach((key) => {
                        if (existingProperties[key]) {
                          newProperties[key] = existingProperties[key];
                        }
                      });
                      schema.properties = newProperties;

                      // Update required
                      if (schema.required) {
                        schema.required = schema.required.filter((key) => keysToPick.includes(key));
                      }
                    }
                  }
                  break;

                case "required":
                  // All fields become required — preserve genuine nullable flags
                  if (schema.properties) {
                    schema.required = Object.keys(schema.properties);
                  }
                  break;

                case "extend":
                  // Extend the schema with new properties
                  if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
                    const extensionProperties: Record<string, OpenApiSchema> = {};
                    const extensionRequired: string[] = [];

                    node.arguments[0].properties.forEach((prop) => {
                      if (t.isObjectProperty(prop)) {
                        const key = t.isIdentifier(prop.key)
                          ? prop.key.name
                          : t.isStringLiteral(prop.key)
                            ? prop.key.value
                            : null;

                        if (key) {
                          // Process the Zod type for this property
                          const propSchema = this.processZodNode(prop.value);
                          if (propSchema) {
                            extensionProperties[key] = propSchema;

                            const isOptional =
                              // @ts-ignore
                              this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);

                            if (!isOptional) {
                              extensionRequired.push(key);
                            }
                          }
                        }
                      }
                    });

                    // Merge with existing schema
                    if (schema.properties) {
                      schema.properties = {
                        ...schema.properties,
                        ...extensionProperties,
                      };
                    } else {
                      schema.properties = extensionProperties;
                    }

                    // Merge required arrays
                    if (extensionRequired.length > 0) {
                      schema.required = [...(schema.required || []), ...extensionRequired];
                      // Deduplicate
                      schema.required = [...new Set(schema.required)];
                    }
                  }
                  break;
              }

              return schema;
            };

            // Find the underlying schema (the most nested object in the chain)
            const findBaseSchema = (node: t.Node): string | null => {
              if (t.isIdentifier(node)) {
                return node.name;
              } else if (t.isMemberExpression(node)) {
                return findBaseSchema(node.object);
              } else if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
                return findBaseSchema(node.callee.object);
              }
              return null;
            };

            // Check method calls on other schemas
            if (t.isCallExpression(path.node.init)) {
              const baseSchemaName = findBaseSchema(path.node.init);

              if (baseSchemaName && baseSchemaName !== "z") {
                logger.debug(`Found chained call starting from: ${baseSchemaName}`);

                // First make sure the underlying schema is processed
                if (!this.zodSchemas[baseSchemaName]) {
                  logger.debug(`Base schema ${baseSchemaName} not found, processing it first`);
                  this.processFileForZodSchema(filePath, baseSchemaName);
                }

                if (this.zodSchemas[baseSchemaName]) {
                  logger.debug("Base schema found, applying transformations");

                  // Copy base schema
                  const baseSchema = JSON.parse(JSON.stringify(this.zodSchemas[baseSchemaName]));

                  // Process the entire call chain
                  const finalSchema = processChainedCall(path.node.init, baseSchema);

                  this.zodSchemas[schemaName] = finalSchema;
                  logger.debug(
                    `Created ${schemaName} with properties: ${Object.keys(
                      finalSchema.properties || {},
                    )}`,
                  );

                  return;
                }
              }
            }

            // Check if it is .extend()
            if (
              t.isCallExpression(path.node.init) &&
              t.isMemberExpression(path.node.init.callee) &&
              t.isIdentifier(path.node.init.callee.property) &&
              path.node.init.callee.property.name === "extend"
            ) {
              const schema = this.processZodNode(path.node.init);
              if (schema) {
                this.zodSchemas[schemaName] = schema;
              }
            }
            // Existing code
            else {
              const schema = this.processZodNode(path.node.init);
              if (schema) {
                this.zodSchemas[schemaName] = schema;
              }
            }
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
                  if (!this.zodSchemas[referencedSchemaName]) {
                    this.processFileForZodSchema(filePath, referencedSchemaName);
                  }
                }
              }
            }

            if (path.node.id.name === schemaName) {
              // Try to find if this is a z.infer<typeof SchemaName> pattern
              if (
                t.isTSTypeReference(path.node.typeAnnotation) &&
                t.isIdentifier(path.node.typeAnnotation.typeName) &&
                path.node.typeAnnotation.typeName.name === "infer" &&
                path.node.typeAnnotation.typeParameters &&
                path.node.typeAnnotation.typeParameters.params.length > 0
              ) {
                const param = path.node.typeAnnotation.typeParameters.params[0];
                if (t.isTSTypeQuery(param) && t.isIdentifier(param.exprName)) {
                  const referencedSchemaName = param.exprName.name;
                  // Find the referenced schema
                  this.processFileForZodSchema(filePath, referencedSchemaName);
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
                declaration.init.callee.object.name === "z"
              ) {
                const schemaName = declaration.id.name;
                if (!this.zodSchemas[schemaName] && !this.processingSchemas.has(schemaName)) {
                  this.processingSchemas.add(schemaName);
                  const schema = this.processZodNode(declaration.init);
                  if (schema) {
                    this.zodSchemas[schemaName] = schema;
                  }
                  this.processingSchemas.delete(schemaName);
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
    // Handle drizzle-zod helper functions (e.g., createInsertSchema, createSelectSchema)
    if (
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      this.drizzleZodImports.has(node.callee.name)
    ) {
      return DrizzleZodProcessor.processSchema(node);
    }

    // Handle reference to another schema (e.g. UserBaseSchema.extend)
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      t.isIdentifier(node.callee.property) &&
      node.callee.property.name === "extend"
    ) {
      const baseSchemaName = node.callee.object.name;

      // Check if the base schema already exists
      if (!this.zodSchemas[baseSchemaName]) {
        // Try to find the basic pattern
        this.convertZodSchemaToOpenApi(baseSchemaName);
      }

      return this.processZodChain(node);
    }

    // Handle z.coerce.TYPE() patterns
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isMemberExpression(node.callee.object) &&
      t.isIdentifier(node.callee.object.object) &&
      node.callee.object.object.name === "z" &&
      t.isIdentifier(node.callee.object.property) &&
      node.callee.object.property.name === "coerce" &&
      t.isIdentifier(node.callee.property)
    ) {
      const coerceType = node.callee.property.name;

      // Create a synthetic node for the underlying type using Babel types
      const syntheticNode = t.callExpression(
        t.memberExpression(t.identifier("z"), t.identifier(coerceType)),
        [],
      );

      return this.processZodPrimitive(syntheticNode);
    }

    // Handle nested Zod namespace helpers like z.iso.datetime()
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isMemberExpression(node.callee.object) &&
      t.isIdentifier(node.callee.property)
    ) {
      let currentObject: t.Node = node.callee.object;
      while (t.isMemberExpression(currentObject)) {
        currentObject = currentObject.object;
      }

      if (t.isIdentifier(currentObject, { name: "z" })) {
        return this.processZodPrimitive(node);
      }
    }

    // Handle z.object({...})
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      node.callee.object.name === "z" &&
      t.isIdentifier(node.callee.property)
    ) {
      const methodName = node.callee.property.name;

      if (methodName === "object" && node.arguments.length > 0) {
        return this.processZodObject(node);
      } else if (methodName === "union" && node.arguments.length > 0) {
        return this.processZodUnion(node);
      } else if (methodName === "intersection" && node.arguments.length > 0) {
        return this.processZodIntersection(node);
      } else if (methodName === "tuple" && node.arguments.length > 0) {
        return this.processZodTuple(node);
      } else if (methodName === "discriminatedUnion" && node.arguments.length > 1) {
        return this.processZodDiscriminatedUnion(node);
      } else if (methodName === "literal" && node.arguments.length > 0) {
        return this.processZodLiteral(node);
      } else {
        return this.processZodPrimitive(node);
      }
    }

    // Handle schema reference with method calls, e.g., Image.optional(), UserSchema.nullable()
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      t.isIdentifier(node.callee.property) &&
      node.callee.object.name !== "z" // Make sure it's not a z.* call
    ) {
      const schemaName = node.callee.object.name;
      const methodName = node.callee.property.name;

      // Process base schema first if not already processed
      if (!this.zodSchemas[schemaName]) {
        this.convertZodSchemaToOpenApi(schemaName);
      }

      // If the schema exists, create a reference and apply the method
      if (this.zodSchemas[schemaName]) {
        let schema: OpenApiSchema = {
          allOf: [{ $ref: `#/components/schemas/${schemaName}` }],
        };

        // Apply method-specific transformations
        switch (methodName) {
          case "optional":
          case "nullable":
          case "nullish":
            // Don't add nullable flag here as it would be at the wrong level
            // The fact that it's optional is handled by not including it in required array
            break;
          case "describe":
            if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
              schema.description = node.arguments[0].value;
            }
            break;
          default:
            // For other methods, process as a chain
            return this.processZodChain(node);
        }

        return schema;
      }
    }

    // Handle chained methods, e.g., z.string().email().min(5)
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isCallExpression(node.callee.object)
    ) {
      return this.processZodChain(node);
    }

    // Handle schema references like z.lazy(() => AnotherSchema)
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      node.callee.object.name === "z" &&
      t.isIdentifier(node.callee.property) &&
      node.callee.property.name === "lazy" &&
      node.arguments.length > 0
    ) {
      return this.processZodLazy(node);
    }

    // Handle potential factory function calls (e.g., createPaginatedSchema(UserSchema))
    // This must be checked before falling back to "Unknown Zod schema node"
    if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
      logger.debug(
        `[processZodNode] Attempting to handle potential factory function: ${node.callee.name}`,
      );

      // We need the current file context - try to get it from the processing context
      // Note: This is a limitation - we may not have file context during preprocessing
      // In that case, we'll return a placeholder and let the main processing handle it
      const currentFilePath = this.currentFilePath;
      const currentAST = this.currentAST;
      const importedModules = this.currentImports;

      if (currentFilePath && currentAST && importedModules) {
        const factoryNode = this.findFactoryFunction(
          node.callee.name,
          currentFilePath,
          currentAST,
          importedModules,
        );

        if (factoryNode) {
          logger.debug(`[processZodNode] Found factory function, expanding...`);
          const schema = this.expandFactoryCall(factoryNode, node, currentFilePath);
          if (schema) {
            logger.debug(
              `[processZodNode] Successfully expanded factory function '${node.callee.name}'`,
            );
            return schema;
          }
        }
      }

      logger.debug(
        `[processZodNode] Could not expand factory function '${node.callee.name}' - missing context or not a factory`,
      );
    }

    // Handle standalone identifier references (e.g., userSchema used directly)
    if (t.isIdentifier(node)) {
      const schemaName = node.name;

      // Try to find and process the referenced schema
      if (!this.zodSchemas[schemaName]) {
        this.convertZodSchemaToOpenApi(schemaName);
      }

      // Return a reference to the schema
      return { $ref: `#/components/schemas/${schemaName}` };
    }

    logger.debug("Unknown Zod schema node:", node);
    return { type: "object" };
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
        return { $ref: `#/components/schemas/${schemaName}` };
      }

      // If the function returns a complex expression, try to process it
      return this.processZodNode(returnExpr);
    }

    return { type: "object" };
  }

  /**
   * Process a Zod literal schema: z.literal("value")
   */
  processZodLiteral(node: t.CallExpression): OpenApiSchema {
    return processZodLiteral(node);
  }

  /**
   * Process a Zod discriminated union: z.discriminatedUnion("type", [schema1, schema2])
   */
  processZodDiscriminatedUnion(node: t.CallExpression): OpenApiSchema {
    return processZodDiscriminatedUnion(node, (element) => this.processZodNode(element));
  }

  /**
   * Process a Zod tuple schema: z.tuple([z.string(), z.number()])
   */
  processZodTuple(node: t.CallExpression): OpenApiSchema {
    return processZodTuple(node, (element) => this.processZodNode(element));
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
    return processZodUnion(node, (element) => this.processZodNode(element));
  }

  /**
   * Process a Zod object schema: z.object({...})
   */
  processZodObject(node: t.CallExpression): OpenApiSchema {
    if (node.arguments.length === 0 || !t.isObjectExpression(node.arguments[0])) {
      return { type: "object" };
    }

    const objectExpression = node.arguments[0];
    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];

    objectExpression.properties.forEach((prop, index) => {
      if (t.isObjectProperty(prop)) {
        let propName: string | undefined;

        // Handle both identifier and string literal keys
        if (t.isIdentifier(prop.key)) {
          propName = prop.key.name;
        } else if (t.isStringLiteral(prop.key)) {
          propName = prop.key.value;
        } else {
          logger.debug(`Skipping property ${index} - unsupported key type`);
          return; // Skip if key is not identifier or string literal
        }

        if (
          t.isCallExpression(prop.value) &&
          t.isMemberExpression(prop.value.callee) &&
          t.isIdentifier(prop.value.callee.object)
        ) {
          const schemaName = prop.value.callee.object.name;
          // @ts-ignore
          const methodName = prop.value.callee.property.name;

          // Process base schema first
          if (!this.zodSchemas[schemaName]) {
            this.convertZodSchemaToOpenApi(schemaName);
          }

          // For describe method, use reference with description
          if (methodName === "describe" && this.zodSchemas[schemaName]) {
            if (prop.value.arguments.length > 0 && t.isStringLiteral(prop.value.arguments[0])) {
              properties[propName] = {
                allOf: [{ $ref: `#/components/schemas/${schemaName}` }],
                description: prop.value.arguments[0].value,
              };
            } else {
              properties[propName] = {
                $ref: `#/components/schemas/${schemaName}`,
              };
            }
            required.push(propName);
            return;
          }

          // For other methods, process normally
          const processedSchema = this.processZodNode(prop.value);
          if (processedSchema) {
            properties[propName] = processedSchema;
            const isOptional = this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);
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
          if (!this.zodSchemas[referencedSchemaName]) {
            this.convertZodSchemaToOpenApi(referencedSchemaName);
          }
          // Create a reference
          properties[propName] = {
            $ref: `#/components/schemas/${referencedSchemaName}`,
          };
          required.push(propName); // Assuming it's required unless marked optional
          return; // Skip further processing for this property
        }

        // For array of schemas (like z.array(PaymentMethodSchema))
        if (
          t.isCallExpression(prop.value) &&
          t.isMemberExpression(prop.value.callee) &&
          t.isIdentifier(prop.value.callee.object) &&
          prop.value.callee.object.name === "z" &&
          t.isIdentifier(prop.value.callee.property) &&
          prop.value.callee.property.name === "array" &&
          prop.value.arguments.length > 0 &&
          t.isIdentifier(prop.value.arguments[0])
        ) {
          const itemSchemaName = prop.value.arguments[0].name;
          // Try to find and convert the referenced schema
          if (!this.zodSchemas[itemSchemaName]) {
            this.convertZodSchemaToOpenApi(itemSchemaName);
          }
          // Process as array with reference
          const arraySchema = this.processZodNode(prop.value);
          arraySchema.items = {
            $ref: `#/components/schemas/${itemSchemaName}`,
          };
          properties[propName] = arraySchema;

          const isOptional = this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);
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
          const isOptional =
            // @ts-ignore
            this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);

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
   * Process a Zod primitive schema: z.string(), z.number(), etc.
   */
  processZodPrimitive(node: t.CallExpression): OpenApiSchema {
    return processZodPrimitiveNode(node, {
      processNode: (currentNode) => this.processZodNode(currentNode),
      processObject: (currentNode) => this.processZodObject(currentNode),
      ensureSchema: (schemaName) => {
        if (!this.zodSchemas[schemaName]) {
          this.convertZodSchemaToOpenApi(schemaName);
        }
      },
    });
  }

  /**
   * Extract description from method arguments if it's a .describe() call
   */
  extractDescriptionFromArguments(node: t.CallExpression): string | null {
    return extractDescriptionFromArguments(node);
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

    // Apply the current method
    switch (methodName) {
      case "omit":
        if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
          node.arguments[0].properties.forEach((prop) => {
            if (
              t.isObjectProperty(prop) &&
              t.isBooleanLiteral(prop.value) &&
              prop.value.value === true
            ) {
              const key = t.isIdentifier(prop.key)
                ? prop.key.name
                : t.isStringLiteral(prop.key)
                  ? prop.key.value
                  : null;

              if (key && schema.properties) {
                delete schema.properties[key];
                if (schema.required) {
                  schema.required = schema.required.filter((requiredKey) => requiredKey !== key);
                }
              }
            }
          });
        }
        break;
      case "optional":
        // optional means T | undefined — not in required array, no nullable flag
        // Required array exclusion is handled by hasOptionalMethod() in processZodObject()
        break;
      case "nullable":
        // nullable means T | null — field stays required but can be null
        if (!schema.allOf) {
          schema.nullable = true;
        }
        break;
      case "nullish": // T | null | undefined
        // Not in required array (handled by hasOptionalMethod) AND can be null
        if (!schema.allOf) {
          schema.nullable = true;
        }
        break;
      case "describe":
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          const description = node.arguments[0].value;
          // Check if description includes @deprecated
          if (description.startsWith("@deprecated")) {
            schema.deprecated = true;
            // Remove @deprecated from description
            schema.description = description.replace("@deprecated", "").trim();
          } else {
            schema.description = description;
          }
        }
        break;
      case "deprecated":
        schema.deprecated = true;
        break;
      case "min":
        if (node.arguments.length > 0 && t.isNumericLiteral(node.arguments[0])) {
          if (schema.type === "string") {
            schema.minLength = node.arguments[0].value;
          } else if (schema.type === "number" || schema.type === "integer") {
            schema.minimum = node.arguments[0].value;
          } else if (schema.type === "array") {
            schema.minItems = node.arguments[0].value;
          }
        }
        break;
      case "max":
        if (node.arguments.length > 0 && t.isNumericLiteral(node.arguments[0])) {
          if (schema.type === "string") {
            schema.maxLength = node.arguments[0].value;
          } else if (schema.type === "number" || schema.type === "integer") {
            schema.maximum = node.arguments[0].value;
          } else if (schema.type === "array") {
            schema.maxItems = node.arguments[0].value;
          }
        }
        break;
      case "length":
        if (node.arguments.length > 0 && t.isNumericLiteral(node.arguments[0])) {
          if (schema.type === "string") {
            schema.minLength = node.arguments[0].value;
            schema.maxLength = node.arguments[0].value;
          } else if (schema.type === "array") {
            schema.minItems = node.arguments[0].value;
            schema.maxItems = node.arguments[0].value;
          }
        }
        break;
      case "email":
        schema.format = "email";
        break;
      case "url":
        schema.format = "uri";
        break;
      case "uri":
        schema.format = "uri";
        break;
      case "uuid":
        schema.format = "uuid";
        break;
      case "cuid":
        schema.format = "cuid";
        break;
      case "regex":
        if (node.arguments.length > 0 && t.isRegExpLiteral(node.arguments[0])) {
          schema.pattern = node.arguments[0].pattern;
        }
        break;
      case "startsWith":
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          schema.pattern = `^${this.escapeRegExp(node.arguments[0].value)}`;
        }
        break;
      case "endsWith":
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          schema.pattern = `${this.escapeRegExp(node.arguments[0].value)}`;
        }
      case "includes":
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          schema.pattern = this.escapeRegExp(node.arguments[0].value);
        }
        break;
      case "int":
        schema.type = "integer";
        break;
      case "positive":
        schema.minimum = 0;
        schema.exclusiveMinimum = true;
        break;
      case "nonnegative":
        schema.minimum = 0;
        break;
      case "negative":
        schema.maximum = 0;
        schema.exclusiveMaximum = true;
        break;
      case "nonpositive":
        schema.maximum = 0;
        break;
      case "finite":
        // Can't express directly in OpenAPI
        break;
      case "safe":
        // Number is within the IEEE-754 "safe integer" range
        schema.minimum = -9007199254740991; // -(2^53 - 1)
        schema.maximum = 9007199254740991; // 2^53 - 1
        break;
      case "default":
        if (node.arguments.length > 0) {
          if (t.isStringLiteral(node.arguments[0])) {
            schema.default = node.arguments[0].value;
          } else if (t.isNumericLiteral(node.arguments[0])) {
            schema.default = node.arguments[0].value;
          } else if (t.isBooleanLiteral(node.arguments[0])) {
            schema.default = node.arguments[0].value;
          } else if (t.isNullLiteral(node.arguments[0])) {
            schema.default = null;
          } else if (t.isObjectExpression(node.arguments[0])) {
            // Try to create a default object, but this might not be complete
            const defaultObj: Record<string, string | number | boolean> = {};
            node.arguments[0].properties.forEach((prop) => {
              if (
                t.isObjectProperty(prop) &&
                (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)) &&
                (t.isStringLiteral(prop.value) ||
                  t.isNumericLiteral(prop.value) ||
                  t.isBooleanLiteral(prop.value))
              ) {
                const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
                const value = t.isStringLiteral(prop.value)
                  ? prop.value.value
                  : t.isNumericLiteral(prop.value)
                    ? prop.value.value
                    : t.isBooleanLiteral(prop.value)
                      ? prop.value.value
                      : null;

                if (key !== null && value !== null) {
                  defaultObj[key] = value;
                }
              }
            });

            schema.default = defaultObj;
          }
        }
        break;
      case "extend":
        if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
          // Get the base schema by processing the object that extend is called on
          const baseSchemaResult = this.processZodNode(node.callee.object);

          // If it's a reference, resolve it to the actual schema
          let baseSchema = baseSchemaResult;
          if (baseSchemaResult && baseSchemaResult.$ref) {
            const schemaName = baseSchemaResult.$ref.replace("#/components/schemas/", "");
            // Try to convert the base schema if not already processed
            if (!this.zodSchemas[schemaName]) {
              logger.debug(
                `[extend] Base schema ${schemaName} not found, attempting to convert it`,
              );
              this.convertZodSchemaToOpenApi(schemaName);
            }
            // Now retrieve the converted schema
            if (this.zodSchemas[schemaName]) {
              baseSchema = this.zodSchemas[schemaName];
            } else {
              logger.debug(`Could not resolve reference for extend: ${schemaName}`);
            }
          }

          // Process the extension object
          const extendNode: any = {
            type: "CallExpression",
            callee: {
              type: "MemberExpression",
              object: { type: "Identifier", name: "z" },
              property: { type: "Identifier", name: "object" },
              computed: false,
              optional: false,
            },
            arguments: [node.arguments[0]],
          };

          const extendedProps = this.processZodObject(extendNode);

          // Merge base schema and extensions
          if (baseSchema && baseSchema.properties) {
            schema = {
              type: "object",
              properties: {
                ...baseSchema.properties,
                ...extendedProps?.properties,
              },
              required: [...(baseSchema.required || []), ...(extendedProps?.required || [])].filter(
                (item, index, arr) => arr.indexOf(item) === index,
              ), // Remove duplicates
            };

            // Copy other properties from base schema
            if (baseSchema.description) schema.description = baseSchema.description;
          } else {
            logger.debug("Could not resolve base schema for extend");
            schema = extendedProps || { type: "object" };
          }
        }
        break;
      case "refine":
      case "superRefine":
        // These are custom validators that cannot be easily represented in OpenAPI
        // We preserve the schema as is
        break;
      case "transform":
        // Transform doesn't change the schema validation, only the output format
        break;
      case "pipe":
        if (node.arguments.length > 0) {
          const firstArgument = node.arguments[0];
          if (firstArgument && !t.isArgumentPlaceholder(firstArgument)) {
            const pipedSchema = this.processZodNode(firstArgument);
            schema = this.mergePipeSchema(schema, pipedSchema);
          }
        }
        break;
      case "or":
        if (node.arguments.length > 0) {
          const firstArgument = node.arguments[0];
          if (!firstArgument) {
            break;
          }
          const alternativeSchema = this.processZodNode(firstArgument);
          if (alternativeSchema) {
            schema = {
              oneOf: [schema, alternativeSchema],
            };
          }
        }
        break;
      case "and":
        if (node.arguments.length > 0) {
          const firstArgument = node.arguments[0];
          if (!firstArgument) {
            break;
          }
          const additionalSchema = this.processZodNode(firstArgument);
          if (additionalSchema) {
            schema = {
              allOf: [schema, additionalSchema],
            };
          }
        }
        break;
    }

    return schema;
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
  isOptional(node: t.CallExpression) {
    return isOptionalCall(node);
  }

  /**
   * Check if a node has .optional() in its method chain
   */
  hasOptionalMethod(node: t.CallExpression): boolean {
    return hasOptionalMethod(node);
  }

  /**
   * Get all processed Zod schemas
   */
  getProcessedSchemas(): Record<string, OpenApiSchema> {
    return this.zodSchemas;
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
      this.getSchemaFiles(dir).forEach((filePath) => this.scanFileForTypeMappings(filePath));
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

  /**
   * Pre-process all Zod schemas in a file
   */
  preprocessAllSchemasInFile(filePath: string, content?: string): void {
    if (this.preprocessedFiles.has(filePath)) {
      return;
    }

    try {
      const ast = this.getParsedFile(filePath, content);

      const { importedModules, drizzleZodImports } = collectImportMetadata(ast);
      drizzleZodImports.forEach((importName) => {
        this.drizzleZodImports.add(importName);
      });

      // Cache imports for this file
      this.fileImportsCache.set(filePath, importedModules);

      // Set current processing context for factory function expansion
      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      // Collect all exported Zod schemas
      traverse(ast, {
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration: t.VariableDeclarator) => {
              if (t.isIdentifier(declaration.id) && declaration.init) {
                const schemaName = declaration.id.name;

                // Check if is Zos schema
                if (this.isZodSchema(declaration.init) && !this.zodSchemas[schemaName]) {
                  logger.debug(`Pre-processing Zod schema: ${schemaName}`);
                  this.processingSchemas.add(schemaName);
                  const schema = this.processZodNode(declaration.init);
                  if (schema) {
                    this.zodSchemas[schemaName] = schema;
                  }
                  this.processingSchemas.delete(schemaName);
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
              if (
                this.isZodSchema(declaration.init) &&
                !this.zodSchemas[schemaName] &&
                !this.processingSchemas.has(schemaName)
              ) {
                logger.debug(`Pre-processing Zod schema: ${schemaName}`);
                this.processingSchemas.add(schemaName);
                const schema = this.processZodNode(declaration.init);
                if (schema) {
                  this.zodSchemas[schemaName] = schema;
                }
                this.processingSchemas.delete(schemaName);
              }
            }
          });
        },
      });

      this.preprocessedFiles.add(filePath);
    } catch (error) {
      logger.error(`Error pre-processing file ${filePath}: ${error}`);
    }
  }

  /**
   * Check if node is Zod schema
   */
  isZodSchema(node: t.Node): boolean {
    return isZodSchemaNode(node, this.drizzleZodImports);
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
   * Find a function definition in an AST
   */
  findFunctionInAST(ast: t.File, functionName: string): t.Node | null {
    return findFunctionInASTHelper(ast, functionName);
  }

  /**
   * Check if a function returns a Zod schema by analyzing return statements
   */
  returnsZodSchema(functionNode: t.Node): boolean {
    return returnsZodSchemaNode(functionNode, (node) => this.isZodSchema(node));
  }

  /**
   * Parse a file with caching (also caches imports)
   */
  parseFileWithCache(filePath: string): t.File | null {
    return parseFileWithCache(
      filePath,
      this.fileAccess,
      this.fileASTCache,
      this.fileImportsCache,
      this.drizzleZodImports,
    );
  }

  /**
   * Resolve import path relative to current file
   */
  resolveImportPath(currentFilePath: string, importSource: string): string | null {
    return resolveImportPath(currentFilePath, importSource, this.fileAccess);
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
