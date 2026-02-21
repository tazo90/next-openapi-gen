import fs from "fs";
import path from "path";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";

// Handle both ES modules and CommonJS
const traverse = (traverseModule as any).default || traverseModule;

import { parseTypeScriptFile } from "./utils.js";
import { OpenApiSchema } from "../types.js";
import { logger } from "./logger.js";
import { DrizzleZodProcessor } from "./drizzle-zod-processor.js";

/**
 * Class for converting Zod schemas to OpenAPI specifications
 */
export class ZodSchemaConverter {
  schemaDirs: string[];
  zodSchemas: Record<string, OpenApiSchema> = {};
  processingSchemas: Set<string> = new Set();
  processedModules: Set<string> = new Set();
  typeToSchemaMapping = {};
  drizzleZodImports: Set<string> = new Set();
  factoryCache: Map<string, t.Node> = new Map(); // Cache for analyzed factory functions
  factoryCheckCache: Map<string, boolean> = new Map(); // Cache for non-factory functions
  fileASTCache: Map<string, t.File> = new Map(); // Cache for parsed files
  fileImportsCache: Map<string, Record<string, string>> = new Map(); // Cache for file imports

  // Current processing context (set during file processing)
  currentFilePath?: string;
  currentAST?: t.File;
  currentImports?: Record<string, string>;

  constructor(schemaDir: string | string[]) {
    const dirs = Array.isArray(schemaDir) ? schemaDir : [schemaDir];
    this.schemaDirs = dirs.map((d) => path.resolve(d));
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
      logger.debug(
        `Type '${schemaName}' is mapped to schema '${mappedSchemaName}'`
      );
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
      if (this.zodSchemas[schemaName]) {
        return this.zodSchemas[schemaName];
      }

      // Find all route files and process them first
      const routeFiles = this.findRouteFiles();

      for (const routeFile of routeFiles) {
        this.processFileForZodSchema(routeFile, schemaName);

        if (this.zodSchemas[schemaName]) {
          logger.debug(
            `Found Zod schema '${schemaName}' in route file: ${routeFile}`
          );
          return this.zodSchemas[schemaName];
        }
      }

      // Scan schema directories
      for (const dir of this.schemaDirs) {
        this.scanDirectoryForZodSchema(dir, schemaName);
        if (this.zodSchemas[schemaName]) break;
      }

      // Return the schema if found, or null if not
      if (this.zodSchemas[schemaName]) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        return this.zodSchemas[schemaName];
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
    const routeFiles: string[] = [];

    // Look for route files in common Next.js API directories
    const possibleApiDirs = [
      path.join(process.cwd(), "src", "app", "api"),
      path.join(process.cwd(), "src", "pages", "api"),
      path.join(process.cwd(), "app", "api"),
      path.join(process.cwd(), "pages", "api"),
    ];

    for (const dir of possibleApiDirs) {
      if (fs.existsSync(dir)) {
        this.findRouteFilesInDir(dir, routeFiles);
      }
    }

    return routeFiles;
  }

  /**
   * Recursively find route files in a directory
   */
  findRouteFilesInDir(dir: string, routeFiles: string[]) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

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
  scanDirectoryForZodSchema(dir: string, schemaName: string) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          this.scanDirectoryForZodSchema(filePath, schemaName);
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          this.processFileForZodSchema(filePath, schemaName);
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dir}: ${error}`);
    }
  }

  /**
   * Process a file to find Zod schema definitions
   */
  processFileForZodSchema(filePath: string, schemaName: string) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Check if file contains schema we are looking for
      if (!content.includes(schemaName)) {
        return;
      }

      // Pre-process all schemas in file
      this.preprocessAllSchemasInFile(filePath);

      // Return it, if the schema has already been processed during pre-processing
      if (this.zodSchemas[schemaName]) {
        return;
      }

      // Parse the file
      const ast = parseTypeScriptFile(content);

      // Cache AST for later use
      this.fileASTCache.set(filePath, ast);

      // Create a map to store imported modules
      let importedModules: Record<string, string> = {};

      // Check if we have cached imports
      if (this.fileImportsCache.has(filePath)) {
        importedModules = this.fileImportsCache.get(filePath)!;
      } else {
        // Build imports cache
        traverse(ast, {
          ImportDeclaration: (path) => {
            const source = path.node.source.value;

            // Track drizzle-zod imports
            if (source === "drizzle-zod") {
              path.node.specifiers.forEach((specifier) => {
                if (
                  t.isImportSpecifier(specifier) ||
                  t.isImportDefaultSpecifier(specifier)
                ) {
                  this.drizzleZodImports.add(specifier.local.name);
                }
              });
            }

            // Process each import specifier
            path.node.specifiers.forEach((specifier) => {
              if (
                t.isImportSpecifier(specifier) ||
                t.isImportDefaultSpecifier(specifier)
              ) {
                const importedName = specifier.local.name;
                importedModules[importedName] = source;
              }
            });
          },
        });

        // Cache imports for this file
        this.fileImportsCache.set(filePath, importedModules);
      }

      // Set current processing context for use by processZodNode during factory expansion
      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      // Look for all exported Zod schemas
      traverse(ast, {

        // For export const SchemaName = z.object({...})
        ExportNamedDeclaration: (path) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration) => {
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
                  logger.debug(`[Schema] Detected potential factory function call: ${factoryName} for schema ${schemaName}`);

                  const factoryNode = this.findFactoryFunction(factoryName, filePath, ast, importedModules);

                  if (factoryNode) {
                    logger.debug(`[Schema] Found factory function, attempting to expand...`);
                    const schema = this.expandFactoryCall(factoryNode, declaration.init, filePath);
                    if (schema) {
                      this.zodSchemas[schemaName] = schema;
                      logger.debug(`[Schema] Successfully expanded factory function '${factoryName}' for schema '${schemaName}'`);
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
                  t.isTSTypeReference(
                    typeAnnotation.typeParameters.params[0]
                  ) &&
                  t.isTSTypeQuery(
                    typeAnnotation.typeParameters.params[0].typeName
                  ) &&
                  t.isIdentifier(
                    // @ts-ignore
                    typeAnnotation.typeParameters.params[0].typeName.exprName
                  )
                ) {
                  const referencedSchema =
                    // @ts-ignore
                    typeAnnotation.typeParameters.params[0].typeName.exprName
                      .name;

                  // Look for the referenced schema in the same file
                  if (!this.zodSchemas[referencedSchema]) {
                    this.processFileForZodSchema(filePath, referencedSchema);
                  }

                  // Use the referenced schema for this type alias
                  if (this.zodSchemas[referencedSchema]) {
                    this.zodSchemas[schemaName] =
                      this.zodSchemas[referencedSchema];
                  }
                }
              }
            }
          }
        },

        // For const SchemaName = z.object({...})
        VariableDeclarator: (path) => {
          if (
            t.isIdentifier(path.node.id) &&
            path.node.id.name === schemaName &&
            path.node.init
          ) {
            // Check if this is any Zod schema (including chained calls)
            if (this.isZodSchema(path.node.init)) {
              const schema = this.processZodNode(path.node.init);
              if (schema) {
                this.zodSchemas[schemaName] = schema;
              }
              return;
            }

            // Helper function for processing the call chain
            const processChainedCall = (node, baseSchema) => {
              if (
                !t.isCallExpression(node) ||
                !t.isMemberExpression(node.callee)
              ) {
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
                  if (
                    node.arguments.length > 0 &&
                    t.isObjectExpression(node.arguments[0])
                  ) {
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
                            schema.required = schema.required.filter(
                              (r) => r !== key
                            );
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
                  if (
                    node.arguments.length > 0 &&
                    t.isObjectExpression(node.arguments[0])
                  ) {
                    const keysToPick = [];
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
                      const newProperties = {};
                      keysToPick.forEach((key) => {
                        if (schema.properties[key]) {
                          newProperties[key] = schema.properties[key];
                        }
                      });
                      schema.properties = newProperties;

                      // Update required
                      if (schema.required) {
                        schema.required = schema.required.filter((key) =>
                          keysToPick.includes(key)
                        );
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
                  if (
                    node.arguments.length > 0 &&
                    t.isObjectExpression(node.arguments[0])
                  ) {
                    const extensionProperties = {};
                    const extensionRequired = [];

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
                      schema.required = [
                        ...(schema.required || []),
                        ...extensionRequired,
                      ];
                      // Deduplicate
                      schema.required = [...new Set(schema.required)];
                    }
                  }
                  break;
              }

              return schema;
            };

            // Find the underlying schema (the most nested object in the chain)
            const findBaseSchema = (node) => {
              if (t.isIdentifier(node)) {
                return node.name;
              } else if (t.isMemberExpression(node)) {
                return findBaseSchema(node.object);
              } else if (
                t.isCallExpression(node) &&
                t.isMemberExpression(node.callee)
              ) {
                return findBaseSchema(node.callee.object);
              }
              return null;
            };

            // Check method calls on other schemas
            if (t.isCallExpression(path.node.init)) {
              const baseSchemaName = findBaseSchema(path.node.init);

              if (baseSchemaName && baseSchemaName !== "z") {
                logger.debug(
                  `Found chained call starting from: ${baseSchemaName}`
                );

                // First make sure the underlying schema is processed
                if (!this.zodSchemas[baseSchemaName]) {
                  logger.debug(
                    `Base schema ${baseSchemaName} not found, processing it first`
                  );
                  this.processFileForZodSchema(filePath, baseSchemaName);
                }

                if (this.zodSchemas[baseSchemaName]) {
                  logger.debug("Base schema found, applying transformations");

                  // Copy base schema
                  const baseSchema = JSON.parse(
                    JSON.stringify(this.zodSchemas[baseSchemaName])
                  );

                  // Process the entire call chain
                  const finalSchema = processChainedCall(
                    path.node.init,
                    baseSchema
                  );

                  this.zodSchemas[schemaName] = finalSchema;
                  logger.debug(
                    `Created ${schemaName} with properties: ${Object.keys(
                      finalSchema.properties || {}
                    )}`
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
        TSTypeAliasDeclaration: (path) => {
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
                  logger.debug(
                    `Mapped type '${typeName}' to schema '${referencedSchemaName}'`
                  );

                  // Process the referenced schema if not already processed
                  if (!this.zodSchemas[referencedSchemaName]) {
                    this.processFileForZodSchema(
                      filePath,
                      referencedSchemaName
                    );
                  }

                  // Use the referenced schema for this type
                  if (this.zodSchemas[referencedSchemaName]) {
                    this.zodSchemas[typeName] =
                      this.zodSchemas[referencedSchemaName];
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
                  if (this.zodSchemas[referencedSchemaName]) {
                    this.zodSchemas[schemaName] =
                      this.zodSchemas[referencedSchemaName];
                  }
                }
              }
            }
          }
        },
      });
    } catch (error) {
      logger.error(
        `Error processing file ${filePath} for schema ${schemaName}: ${error}`
      );
    }
  }

  /**
   * Process all exported schemas in a file, not just the one we're looking for
   */
  processAllSchemasInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

      traverse(ast, {
        ExportNamedDeclaration: (path) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration) => {
              if (
                t.isIdentifier(declaration.id) &&
                declaration.init &&
                t.isCallExpression(declaration.init) &&
                t.isMemberExpression(declaration.init.callee) &&
                t.isIdentifier(declaration.init.callee.object) &&
                declaration.init.callee.object.name === "z"
              ) {
                const schemaName = declaration.id.name;
                if (
                  !this.zodSchemas[schemaName] &&
                  !this.processingSchemas.has(schemaName)
                ) {
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
      logger.error(
        `Error processing all schemas in file ${filePath}: ${error}`
      );
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
        []
      );

      return this.processZodPrimitive(syntheticNode);
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
      } else if (
        methodName === "discriminatedUnion" &&
        node.arguments.length > 1
      ) {
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
            if (
              node.arguments.length > 0 &&
              t.isStringLiteral(node.arguments[0])
            ) {
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
    if (
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee)
    ) {
      logger.debug(`[processZodNode] Attempting to handle potential factory function: ${node.callee.name}`);

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
          importedModules
        );

        if (factoryNode) {
          logger.debug(`[processZodNode] Found factory function, expanding...`);
          const schema = this.expandFactoryCall(factoryNode, node, currentFilePath);
          if (schema) {
            logger.debug(`[processZodNode] Successfully expanded factory function '${node.callee.name}'`);
            return schema;
          }
        }
      }

      logger.debug(`[processZodNode] Could not expand factory function '${node.callee.name}' - missing context or not a factory`);
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
    if (node.arguments.length === 0) {
      return { type: "string" };
    }

    const arg = node.arguments[0];

    if (t.isStringLiteral(arg)) {
      return {
        type: "string",
        enum: [arg.value],
      };
    } else if (t.isNumericLiteral(arg)) {
      return {
        type: "number",
        enum: [arg.value],
      };
    } else if (t.isBooleanLiteral(arg)) {
      return {
        type: "boolean",
        enum: [arg.value],
      };
    }

    return { type: "string" };
  }

  /**
   * Process a Zod discriminated union: z.discriminatedUnion("type", [schema1, schema2])
   */
  processZodDiscriminatedUnion(node: t.CallExpression): OpenApiSchema {
    if (node.arguments.length < 2) {
      return { type: "object" };
    }

    // Get the discriminator field name
    let discriminator = "";
    if (t.isStringLiteral(node.arguments[0])) {
      discriminator = node.arguments[0].value;
    }

    // Get the schemas array
    const schemasArray = node.arguments[1];

    if (!t.isArrayExpression(schemasArray)) {
      return { type: "object" };
    }

    const schemas = schemasArray.elements
      .map((element) => this.processZodNode(element))
      .filter((schema) => schema !== null);

    if (schemas.length === 0) {
      return { type: "object" };
    }

    // Create a discriminated mapping for oneOf
    return {
      type: "object",
      discriminator: discriminator
        ? {
            propertyName: discriminator,
          }
        : undefined,
      oneOf: schemas,
    };
  }

  /**
   * Process a Zod tuple schema: z.tuple([z.string(), z.number()])
   */
  processZodTuple(node: t.CallExpression): OpenApiSchema {
    if (
      node.arguments.length === 0 ||
      !t.isArrayExpression(node.arguments[0])
    ) {
      return { type: "array", items: { type: "string" } };
    }

    const tupleItems = node.arguments[0].elements.map((element) =>
      this.processZodNode(element)
    );

    // In OpenAPI, we can represent this as an array with prefixItems (OpenAPI 3.1+)
    // For OpenAPI 3.0.x, we'll use items with type: array
    return {
      type: "array",
      items: tupleItems.length > 0 ? tupleItems[0] : { type: "string" },
      // For OpenAPI 3.1+: prefixItems: tupleItems
    };
  }

  /**
   * Process a Zod intersection schema: z.intersection(schema1, schema2)
   */
  processZodIntersection(node: t.CallExpression): OpenApiSchema {
    if (node.arguments.length < 2) {
      return { type: "object" };
    }

    const schema1 = this.processZodNode(node.arguments[0]);
    const schema2 = this.processZodNode(node.arguments[1]);

    // In OpenAPI, we can use allOf to represent intersection
    return {
      allOf: [schema1, schema2],
    };
  }

  /**
   * Process a Zod union schema: z.union([schema1, schema2])
   */
  processZodUnion(node: t.CallExpression): OpenApiSchema {
    if (
      node.arguments.length === 0 ||
      !t.isArrayExpression(node.arguments[0])
    ) {
      return { type: "object" };
    }

    const unionItems = node.arguments[0].elements.map((element) =>
      this.processZodNode(element)
    );

    // Check for common pattern: z.union([z.string(), z.null()]) which should be nullable string
    if (unionItems.length === 2) {
      const isNullable = unionItems.some(
        (item) =>
          item.type === "null" ||
          (item.enum && item.enum.length === 1 && item.enum[0] === null)
      );

      if (isNullable) {
        const nonNullItem = unionItems.find(
          (item) =>
            item.type !== "null" &&
            !(item.enum && item.enum.length === 1 && item.enum[0] === null)
        );

        if (nonNullItem) {
          return {
            ...nonNullItem,
            nullable: true,
          };
        }
      }
    }

    // Check if all union items are of the same type with different enum values
    // This is common for string literals like: z.union([z.literal("a"), z.literal("b")])
    const allSameType =
      unionItems.length > 0 &&
      unionItems.every((item) => item.type === unionItems[0].type && item.enum);

    if (allSameType) {
      // Combine all enum values
      const combinedEnums = unionItems.flatMap((item) => item.enum || []);

      return {
        type: unionItems[0].type,
        enum: combinedEnums,
      };
    }

    // Otherwise, use oneOf for general unions
    return {
      oneOf: unionItems,
    };
  }

  /**
   * Process a Zod object schema: z.object({...})
   */
  processZodObject(node: t.CallExpression): OpenApiSchema {
    if (
      node.arguments.length === 0 ||
      !t.isObjectExpression(node.arguments[0])
    ) {
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
            if (
              prop.value.arguments.length > 0 &&
              t.isStringLiteral(prop.value.arguments[0])
            ) {
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
            const isOptional =
              this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);
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

          const isOptional =
            this.isOptional(prop.value) || this.hasOptionalMethod(prop.value);
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
    if (
      !t.isMemberExpression(node.callee) ||
      !t.isIdentifier(node.callee.property)
    ) {
      return { type: "string" };
    }

    const zodType = node.callee.property.name;
    let schema: OpenApiSchema = {};

    // Basic type mapping
    switch (zodType) {
      case "string":
        schema = { type: "string" };
        break;
      case "number":
        schema = { type: "number" };
        break;
      case "boolean":
        schema = { type: "boolean" };
        break;
      case "date":
        schema = { type: "string", format: "date-time" };
        break;
      case "bigint":
        schema = { type: "integer", format: "int64" };
        break;
      case "any":
      case "unknown":
        schema = {}; // Empty schema matches anything
        break;
      case "null":
      case "undefined":
        schema = { type: "null" };
        break;
      case "array":
        let itemsType = { type: "string" };
        if (node.arguments.length > 0) {
          // Check if argument is an identifier (schema reference)
          if (t.isIdentifier(node.arguments[0])) {
            const schemaName = node.arguments[0].name;
            // Try to find and convert the referenced schema
            if (!this.zodSchemas[schemaName]) {
              this.convertZodSchemaToOpenApi(schemaName);
            }
            // @ts-ignore
            itemsType = { $ref: `#/components/schemas/${schemaName}` };
          } else {
            // @ts-ignore
            itemsType = this.processZodNode(node.arguments[0]);
          }
        }
        schema = { type: "array", items: itemsType };
        break;
      case "enum":
        if (
          node.arguments.length > 0 &&
          t.isArrayExpression(node.arguments[0])
        ) {
          const enumValues = node.arguments[0].elements
            .filter((el) => t.isStringLiteral(el) || t.isNumericLiteral(el))
            // @ts-ignore
            .map((el) => el.value);

          const firstValue = enumValues[0];
          const valueType = typeof firstValue;

          schema = {
            type: valueType === "number" ? "number" : "string",
            enum: enumValues,
          };
        } else if (
          node.arguments.length > 0 &&
          t.isObjectExpression(node.arguments[0])
        ) {
          // Handle z.enum({ KEY1: "value1", KEY2: "value2" })
          const enumValues: string[] = [];

          node.arguments[0].properties.forEach((prop) => {
            if (t.isObjectProperty(prop) && t.isStringLiteral(prop.value)) {
              enumValues.push(prop.value.value);
            }
          });

          if (enumValues.length > 0) {
            schema = {
              type: "string",
              enum: enumValues,
            };
          } else {
            schema = { type: "string" };
          }
        } else {
          schema = { type: "string" };
        }
        break;
      case "record":
        let valueType: OpenApiSchema = { type: "string" };
        if (node.arguments.length > 0) {
          valueType = this.processZodNode(node.arguments[0]);
        }

        schema = {
          type: "object",
          additionalProperties: valueType,
        };
        break;
      case "map":
        schema = {
          type: "object",
          additionalProperties: true,
        };
        break;
      case "set":
        let setItemType: OpenApiSchema = { type: "string" };
        if (node.arguments.length > 0) {
          setItemType = this.processZodNode(node.arguments[0]);
        }
        schema = {
          type: "array",
          items: setItemType,
          uniqueItems: true,
        };
        break;
      case "object":
        if (node.arguments.length > 0) {
          schema = this.processZodObject(node);
        } else {
          schema = { type: "object" };
        }
        break;
      case "custom":
        // Check if it has TypeScript generic type parameters (z.custom<File>())
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          const typeParam = node.typeParameters.params[0];

          // Check if the generic type is File
          if (
            t.isTSTypeReference(typeParam) &&
            t.isIdentifier(typeParam.typeName) &&
            typeParam.typeName.name === "File"
          ) {
            schema = {
              type: "string",
              format: "binary",
            };
          } else {
            // Other generic types default to string
            schema = { type: "string" };
          }
        } else if (
          node.arguments.length > 0 &&
          t.isArrowFunctionExpression(node.arguments[0])
        ) {
          // Legacy support: FormData validation
          schema = {
            type: "object",
            additionalProperties: true,
          };
        } else {
          // Default case for z.custom() without specific type detection
          schema = { type: "string" };
        }
        break;
      default:
        schema = { type: "string" };
        break;
    }

    // Extract description if it exists from direct method calls
    const description = this.extractDescriptionFromArguments(node);
    if (description) {
      schema.description = description;
    }

    return schema;
  }

  /**
   * Extract description from method arguments if it's a .describe() call
   */
  extractDescriptionFromArguments(node: t.CallExpression): string | null {
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property) &&
      node.callee.property.name === "describe" &&
      node.arguments.length > 0 &&
      t.isStringLiteral(node.arguments[0])
    ) {
      return node.arguments[0].value;
    }
    return null;
  }

  /**
   * Process a Zod chained method call: z.string().email().min(5)
   */
  processZodChain(node: t.CallExpression): OpenApiSchema {
    if (
      !t.isMemberExpression(node.callee) ||
      !t.isIdentifier(node.callee.property)
    ) {
      return { type: "object" };
    }

    const methodName = node.callee.property.name;

    // Process the parent chain first
    let schema = this.processZodNode(node.callee.object);

    // Apply the current method
    switch (methodName) {
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
        if (
          node.arguments.length > 0 &&
          t.isNumericLiteral(node.arguments[0])
        ) {
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
        if (
          node.arguments.length > 0 &&
          t.isNumericLiteral(node.arguments[0])
        ) {
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
        if (
          node.arguments.length > 0 &&
          t.isNumericLiteral(node.arguments[0])
        ) {
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
            const defaultObj = {};
            node.arguments[0].properties.forEach((prop) => {
              if (
                t.isObjectProperty(prop) &&
                (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)) &&
                (t.isStringLiteral(prop.value) ||
                  t.isNumericLiteral(prop.value) ||
                  t.isBooleanLiteral(prop.value))
              ) {
                const key = t.isIdentifier(prop.key)
                  ? prop.key.name
                  : prop.key.value;
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
        if (
          node.arguments.length > 0 &&
          t.isObjectExpression(node.arguments[0])
        ) {
          // Get the base schema by processing the object that extend is called on
          const baseSchemaResult = this.processZodNode(node.callee.object);

          // If it's a reference, resolve it to the actual schema
          let baseSchema = baseSchemaResult;
          if (baseSchemaResult && baseSchemaResult.$ref) {
            const schemaName = baseSchemaResult.$ref.replace(
              "#/components/schemas/",
              ""
            );
            // Try to convert the base schema if not already processed
            if (!this.zodSchemas[schemaName]) {
              logger.debug(
                `[extend] Base schema ${schemaName} not found, attempting to convert it`
              );
              this.convertZodSchemaToOpenApi(schemaName);
            }
            // Now retrieve the converted schema
            if (this.zodSchemas[schemaName]) {
              baseSchema = this.zodSchemas[schemaName];
            } else {
              logger.debug(
                `Could not resolve reference for extend: ${schemaName}`
              );
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
                ...(extendedProps?.properties || {}),
              },
              required: [
                ...(baseSchema.required || []),
                ...(extendedProps?.required || []),
              ].filter((item, index, arr) => arr.indexOf(item) === index), // Remove duplicates
            };

            // Copy other properties from base schema
            if (baseSchema.description)
              schema.description = baseSchema.description;
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
      case "or":
        if (node.arguments.length > 0) {
          const alternativeSchema = this.processZodNode(node.arguments[0]);
          if (alternativeSchema) {
            schema = {
              oneOf: [schema, alternativeSchema],
            };
          }
        }
        break;
      case "and":
        if (node.arguments.length > 0) {
          const additionalSchema = this.processZodNode(node.arguments[0]);
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
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Check if a Zod schema is optional
   */
  isOptional(node: t.CallExpression) {
    // Direct .optional() call
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property) &&
      node.callee.property.name === "optional"
    ) {
      return true;
    }

    // Check for chained calls that end with .optional()
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isCallExpression(node.callee.object)
    ) {
      return this.hasOptionalMethod(node);
    }

    return false;
  }

  /**
   * Check if a node has .optional() in its method chain
   */
  hasOptionalMethod(node: t.CallExpression) {
    if (!t.isCallExpression(node)) {
      return false;
    }

    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property) &&
      (node.callee.property.name === "optional" ||
        node.callee.property.name === "nullish")
    ) {
      return true;
    }

    if (
      t.isMemberExpression(node.callee) &&
      t.isCallExpression(node.callee.object)
    ) {
      return this.hasOptionalMethod(node.callee.object);
    }

    return false;
  }

  /**
   * Get all processed Zod schemas
   */
  getProcessedSchemas() {
    return this.zodSchemas;
  }

  /**
   * Pre-scan all files to build type mappings
   */
  preScanForTypeMappings() {
    logger.debug("Pre-scanning for type mappings...");

    // Scan route files
    const routeFiles = this.findRouteFiles();
    for (const routeFile of routeFiles) {
      this.scanFileForTypeMappings(routeFile);
    }

    // Scan schema directories
    for (const dir of this.schemaDirs) {
      this.scanDirectoryForTypeMappings(dir);
    }
  }

  /**
   * Scan a single file for type mappings
   */
  scanFileForTypeMappings(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

      traverse(ast, {
        TSTypeAliasDeclaration: (path) => {
          if (t.isIdentifier(path.node.id)) {
            const typeName = path.node.id.name;

            // Check for z.infer<typeof SchemaName> pattern
            if (t.isTSTypeReference(path.node.typeAnnotation)) {
              const typeRef = path.node.typeAnnotation;

              // Handle both z.infer and just infer (when z is imported)
              let isInferType = false;

              if (
                t.isTSQualifiedName(typeRef.typeName) &&
                t.isIdentifier(typeRef.typeName.left) &&
                typeRef.typeName.left.name === "z" &&
                t.isIdentifier(typeRef.typeName.right) &&
                typeRef.typeName.right.name === "infer"
              ) {
                isInferType = true;
              } else if (
                t.isIdentifier(typeRef.typeName) &&
                typeRef.typeName.name === "infer"
              ) {
                isInferType = true;
              }

              if (
                isInferType &&
                typeRef.typeParameters &&
                typeRef.typeParameters.params.length > 0
              ) {
                const param = typeRef.typeParameters.params[0];
                if (t.isTSTypeQuery(param) && t.isIdentifier(param.exprName)) {
                  const referencedSchemaName = param.exprName.name;
                  this.typeToSchemaMapping[typeName] = referencedSchemaName;
                  logger.debug(
                    `Pre-scan: Mapped type '${typeName}' to schema '${referencedSchemaName}'`
                  );
                }
              }
            }
          }
        },
      });
    } catch (error) {
      logger.error(
        `Error scanning file ${filePath} for type mappings: ${error}`
      );
    }
  }

  /**
   * Recursively scan directory for type mappings
   */
  scanDirectoryForTypeMappings(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          this.scanDirectoryForTypeMappings(filePath);
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          this.scanFileForTypeMappings(filePath);
        }
      }
    } catch (error) {
      logger.error(
        `Error scanning directory ${dir} for type mappings: ${error}`
      );
    }
  }

  /**
   * Pre-process all Zod schemas in a file
   */
  preprocessAllSchemasInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

      // Cache AST for later use
      this.fileASTCache.set(filePath, ast);

      // Collect imports to enable factory function resolution during preprocessing
      let importedModules: Record<string, string> = {};

      // First, collect all drizzle-zod imports and regular imports
      traverse(ast, {
        ImportDeclaration: (path) => {
          const source = path.node.source.value;
          if (source === "drizzle-zod") {
            path.node.specifiers.forEach((specifier) => {
              if (
                t.isImportSpecifier(specifier) ||
                t.isImportDefaultSpecifier(specifier)
              ) {
                this.drizzleZodImports.add(specifier.local.name);
              }
            });
          }

          // Track all imports for factory function resolution
          path.node.specifiers.forEach((specifier) => {
            if (
              t.isImportSpecifier(specifier) ||
              t.isImportDefaultSpecifier(specifier)
            ) {
              const importedName = specifier.local.name;
              importedModules[importedName] = source;
            }
          });
        },
      });

      // Cache imports for this file
      this.fileImportsCache.set(filePath, importedModules);

      // Set current processing context for factory function expansion
      this.currentFilePath = filePath;
      this.currentAST = ast;
      this.currentImports = importedModules;

      // Collect all exported Zod schemas
      traverse(ast, {
        ExportNamedDeclaration: (path) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration) => {
              if (t.isIdentifier(declaration.id) && declaration.init) {
                const schemaName = declaration.id.name;

                // Check if is Zos schema
                if (
                  this.isZodSchema(declaration.init) &&
                  !this.zodSchemas[schemaName]
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
          }
        },
        // Also process non-exported const declarations
        VariableDeclaration: (path) => {
          path.node.declarations.forEach((declaration) => {
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
    } catch (error) {
      logger.error(`Error pre-processing file ${filePath}: ${error}`);
    }
  }

  /**
   * Check if node is Zod schema
   */
  isZodSchema(node) {
    if (t.isCallExpression(node)) {
      // Check for drizzle-zod helper functions (e.g., createInsertSchema, createSelectSchema)
      if (
        t.isIdentifier(node.callee) &&
        this.drizzleZodImports.has(node.callee.name)
      ) {
        logger.debug(
          `[isZodSchema] Detected drizzle-zod function: ${node.callee.name}`
        );
        return true;
      }

      // Check direct z.method() calls
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.object) &&
        node.callee.object.name === "z"
      ) {
        return true;
      }

      // Check chained calls like z.string().regex()
      if (
        t.isMemberExpression(node.callee) &&
        t.isCallExpression(node.callee.object)
      ) {
        return this.isZodSchema(node.callee.object);
      }

      // Do NOT treat unknown function calls as potential Zod schemas here
      // Factory functions will be detected and handled in processZodNode() instead
      // This prevents false positives during preprocessing
    }
    return false;
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
    importedModules: Record<string, string>
  ): t.Node | null {
    // Check positive cache first
    if (this.factoryCache.has(functionName)) {
      logger.debug(`[Factory] Cache hit for function '${functionName}'`);
      return this.factoryCache.get(functionName)!;
    }

    // Check negative cache (already checked, not a factory)
    if (this.factoryCheckCache.has(functionName)) {
      logger.debug(`[Factory] Negative cache hit for function '${functionName}'`);
      return null;
    }

    logger.debug(`[Factory] Searching for function '${functionName}'`);

    // Look in current file first (AST already parsed)
    const localFactory = this.findFunctionInAST(currentAST, functionName);
    if (localFactory && this.returnsZodSchema(localFactory)) {
      logger.debug(`[Factory] Found Zod factory function '${functionName}' in current file`);
      this.factoryCache.set(functionName, localFactory);
      return localFactory;
    }

    // Check if function is imported
    const importSource = importedModules[functionName];
    if (importSource) {
      logger.debug(`[Factory] Function '${functionName}' is imported from '${importSource}'`);

      // Resolve import path
      const importedFilePath = this.resolveImportPath(currentFilePath, importSource);
      if (importedFilePath && fs.existsSync(importedFilePath)) {
        logger.debug(`[Factory] Resolved import to: ${importedFilePath}`);

        // Parse imported file (with caching) - this will also cache imports
        const importedAST = this.parseFileWithCache(importedFilePath);
        if (importedAST) {
          const importedFactory = this.findFunctionInAST(importedAST, functionName);
          if (importedFactory && this.returnsZodSchema(importedFactory)) {
            logger.debug(`[Factory] Found Zod factory function '${functionName}' in imported file`);
            this.factoryCache.set(functionName, importedFactory);
            return importedFactory;
          } else {
            logger.debug(`[Factory] Function '${functionName}' found in imported file but does not return Zod schema`);
          }
        }
      } else {
        logger.debug(`[Factory] Could not resolve import path for '${importSource}'`);
      }
    } else {
      logger.debug(`[Factory] Function '${functionName}' is not imported`);
    }

    // Not found or not a Zod factory - cache negative result
    logger.debug(`[Factory] Function '${functionName}' is not a Zod factory`);
    this.factoryCheckCache.set(functionName, false);
    return null;
  }

  /**
   * Find a function definition in an AST
   */
  findFunctionInAST(ast: t.File, functionName: string): t.Node | null {
    let foundFunction: t.Node | null = null;

    traverse(ast, {
      // Handle: export function createSchema() { ... }
      FunctionDeclaration: (path) => {
        if (t.isIdentifier(path.node.id) && path.node.id.name === functionName) {
          foundFunction = path.node;
          path.stop();
        }
      },
      // Handle: export const createSchema = (...) => { ... }
      VariableDeclarator: (path) => {
        if (
          t.isIdentifier(path.node.id) &&
          path.node.id.name === functionName &&
          (t.isArrowFunctionExpression(path.node.init) ||
            t.isFunctionExpression(path.node.init))
        ) {
          foundFunction = path.node.init;
          path.stop();
        }
      },
    });

    return foundFunction;
  }

  /**
   * Check if a function returns a Zod schema by analyzing return statements
   */
  returnsZodSchema(functionNode: t.Node): boolean {
    if (
      !t.isFunctionDeclaration(functionNode) &&
      !t.isArrowFunctionExpression(functionNode) &&
      !t.isFunctionExpression(functionNode)
    ) {
      return false;
    }

    let returnsZod = false;

    // For arrow functions with direct return (no block)
    if (
      t.isArrowFunctionExpression(functionNode) &&
      !t.isBlockStatement(functionNode.body)
    ) {
      returnsZod = this.isZodSchema(functionNode.body);
      logger.debug(`[Factory] Arrow function direct return, isZodSchema: ${returnsZod}`);
      return returnsZod;
    }

    // For functions with block statements, analyze return statements manually
    const body = functionNode.body;
    if (!t.isBlockStatement(body)) {
      return false;
    }

    // Manually walk through statements instead of using traverse
    const checkStatements = (statements: t.Statement[]): boolean => {
      for (const stmt of statements) {
        if (t.isReturnStatement(stmt) && stmt.argument) {
          if (this.isZodSchema(stmt.argument)) {
            logger.debug(`[Factory] Found Zod schema in return statement`);
            return true;
          }
        }
        // Check nested blocks (if statements, etc.)
        else if (t.isIfStatement(stmt)) {
          if (t.isBlockStatement(stmt.consequent)) {
            if (checkStatements(stmt.consequent.body)) return true;
          } else if (t.isReturnStatement(stmt.consequent) && stmt.consequent.argument) {
            if (this.isZodSchema(stmt.consequent.argument)) return true;
          }
          if (stmt.alternate) {
            if (t.isBlockStatement(stmt.alternate)) {
              if (checkStatements(stmt.alternate.body)) return true;
            } else if (t.isReturnStatement(stmt.alternate) && stmt.alternate.argument) {
              if (this.isZodSchema(stmt.alternate.argument)) return true;
            }
          }
        }
      }
      return false;
    };

    returnsZod = checkStatements(body.body);
    return returnsZod;
  }

  /**
   * Parse a file with caching (also caches imports)
   */
  parseFileWithCache(filePath: string): t.File | null {
    if (this.fileASTCache.has(filePath)) {
      return this.fileASTCache.get(filePath)!;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);
      this.fileASTCache.set(filePath, ast);

      // Also build and cache imports for this file
      if (!this.fileImportsCache.has(filePath)) {
        const importedModules: Record<string, string> = {};

        traverse(ast, {
          ImportDeclaration: (path) => {
            const source = path.node.source.value;

            // Track drizzle-zod imports
            if (source === "drizzle-zod") {
              path.node.specifiers.forEach((specifier) => {
                if (
                  t.isImportSpecifier(specifier) ||
                  t.isImportDefaultSpecifier(specifier)
                ) {
                  this.drizzleZodImports.add(specifier.local.name);
                }
              });
            }

            // Process each import specifier
            path.node.specifiers.forEach((specifier) => {
              if (
                t.isImportSpecifier(specifier) ||
                t.isImportDefaultSpecifier(specifier)
              ) {
                const importedName = specifier.local.name;
                importedModules[importedName] = source;
              }
            });
          },
        });

        this.fileImportsCache.set(filePath, importedModules);
      }

      return ast;
    } catch (error) {
      logger.error(`[Factory] Error parsing file '${filePath}': ${error}`);
      return null;
    }
  }

  /**
   * Resolve import path relative to current file
   */
  resolveImportPath(currentFilePath: string, importSource: string): string | null {
    // Handle relative imports
    if (importSource.startsWith(".")) {
      const currentDir = path.dirname(currentFilePath);
      let resolvedPath = path.resolve(currentDir, importSource);

      // Try adding extensions if not present
      const extensions = [".ts", ".tsx", ".js", ".jsx"];
      if (!path.extname(resolvedPath)) {
        for (const ext of extensions) {
          const withExt = resolvedPath + ext;
          if (fs.existsSync(withExt)) {
            return withExt;
          }
        }
        // Try index files
        for (const ext of extensions) {
          const indexPath = path.join(resolvedPath, `index${ext}`);
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }
      } else if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
    }

    // Handle absolute imports from schemaDir
    // This is a simplified approach - you might need to enhance this based on tsconfig paths
    return null;
  }

  /**
   * Expand a factory function call by substituting arguments
   */
  expandFactoryCall(
    factoryNode: t.Node,
    callNode: t.CallExpression,
    filePath: string
  ): OpenApiSchema | null {
    if (
      !t.isFunctionDeclaration(factoryNode) &&
      !t.isArrowFunctionExpression(factoryNode) &&
      !t.isFunctionExpression(factoryNode)
    ) {
      return null;
    }

    logger.debug(`[Factory] Expanding factory call with ${callNode.arguments.length} arguments`);

    // Build parameter -> argument mapping
    const paramMap = new Map<string, t.Node>();
    const params = factoryNode.params;

    for (let i = 0; i < params.length && i < callNode.arguments.length; i++) {
      const param = params[i];
      const arg = callNode.arguments[i];

      if (t.isIdentifier(param)) {
        paramMap.set(param.name, arg);
        logger.debug(`[Factory] Mapped parameter '${param.name}' to argument`);
      } else if (t.isObjectPattern(param)) {
        // Handle destructured parameters - simplified for now
        logger.debug(`[Factory] Skipping destructured parameter (not yet supported)`);
      }
    }

    // Extract return statement
    const returnNode = this.extractReturnNode(factoryNode);
    if (!returnNode) {
      logger.debug(`[Factory] No return statement found in factory`);
      return null;
    }

    logger.debug(`[Factory] Return node type: ${returnNode.type}`);

    // Clone and substitute parameters in return node
    const substitutedNode = this.substituteParameters(returnNode, paramMap, filePath);

    logger.debug(`[Factory] Substituted node type: ${substitutedNode.type}`);

    // Process the substituted node as a normal Zod schema
    const result = this.processZodNode(substitutedNode);

    if (result) {
      logger.debug(`[Factory] Successfully processed substituted node, result has ${Object.keys(result).length} keys`);
    } else {
      logger.debug(`[Factory] Failed to process substituted node`);
    }

    return result;
  }

  /**
   * Extract the return node from a function
   */
  extractReturnNode(functionNode: t.Node): t.Node | null {
    // For arrow functions with direct return (no block)
    if (
      t.isArrowFunctionExpression(functionNode) &&
      !t.isBlockStatement(functionNode.body)
    ) {
      return functionNode.body;
    }

    // For functions with block statements
    const body = t.isFunctionDeclaration(functionNode) ||
      t.isArrowFunctionExpression(functionNode) ||
      t.isFunctionExpression(functionNode)
      ? functionNode.body
      : null;

    if (!body || !t.isBlockStatement(body)) {
      return null;
    }

    // Find first return statement manually
    const findReturn = (statements: t.Statement[]): t.Node | null => {
      for (const stmt of statements) {
        if (t.isReturnStatement(stmt) && stmt.argument) {
          return stmt.argument;
        }
        // Check nested blocks
        if (t.isIfStatement(stmt)) {
          if (t.isBlockStatement(stmt.consequent)) {
            const found = findReturn(stmt.consequent.body);
            if (found) return found;
          } else if (t.isReturnStatement(stmt.consequent) && stmt.consequent.argument) {
            return stmt.consequent.argument;
          }
          if (stmt.alternate) {
            if (t.isBlockStatement(stmt.alternate)) {
              const found = findReturn(stmt.alternate.body);
              if (found) return found;
            } else if (t.isReturnStatement(stmt.alternate) && stmt.alternate.argument) {
              return stmt.alternate.argument;
            }
          }
        }
      }
      return null;
    };

    return findReturn(body.body);
  }

  /**
   * Substitute parameters with actual arguments in an AST node (deep clone and replace)
   */
  substituteParameters(
    node: t.Node,
    paramMap: Map<string, t.Node>,
    filePath: string
  ): t.Node {
    // Deep clone the node to avoid modifying the original
    const cloned = t.cloneNode(node, /* deep */ true, /* withoutLoc */ false);

    // Manual recursive substitution without traverse
    const substitute = (n: t.Node): t.Node => {
      if (t.isIdentifier(n)) {
        // Replace if this is a parameter
        if (paramMap.has(n.name)) {
          const replacement = paramMap.get(n.name)!;
          return t.cloneNode(replacement, true, false);
        }
        return n;
      }

      // Handle CallExpression
      if (t.isCallExpression(n)) {
        return t.callExpression(
          substitute(n.callee) as t.Expression,
          n.arguments.map((arg) => {
            if (t.isSpreadElement(arg)) {
              return t.spreadElement(substitute(arg.argument) as t.Expression);
            }
            return substitute(arg) as t.Expression;
          })
        );
      }

      // Handle MemberExpression
      if (t.isMemberExpression(n)) {
        return t.memberExpression(
          substitute(n.object) as t.Expression,
          n.computed ? (substitute(n.property) as t.Expression) : n.property,
          n.computed
        );
      }

      // Handle ObjectExpression
      if (t.isObjectExpression(n)) {
        return t.objectExpression(
          n.properties.map((prop) => {
            if (t.isObjectProperty(prop)) {
              return t.objectProperty(
                prop.computed ? (substitute(prop.key) as t.Expression) : prop.key,
                substitute(prop.value) as t.Expression,
                prop.computed,
                prop.shorthand
              );
            }
            if (t.isSpreadElement(prop)) {
              return t.spreadElement(substitute(prop.argument) as t.Expression);
            }
            return prop;
          })
        );
      }

      // Handle ArrayExpression
      if (t.isArrayExpression(n)) {
        return t.arrayExpression(
          n.elements.map((elem) => {
            if (!elem) return null;
            if (t.isSpreadElement(elem)) {
              return t.spreadElement(substitute(elem.argument) as t.Expression);
            }
            return substitute(elem) as t.Expression;
          })
        );
      }

      // Return as-is for other node types
      return n;
    };

    return substitute(cloned);
  }
}
