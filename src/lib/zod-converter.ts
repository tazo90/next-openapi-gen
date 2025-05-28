import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { OpenApiSchema } from "../types.js";

/**
 * Class for converting Zod schemas to OpenAPI specifications
 */
export class ZodSchemaConverter {
  schemaDir: string;
  zodSchemas: Record<string, OpenApiSchema> = {};
  processingSchemas: Set<string> = new Set();
  processedModules: Set<string> = new Set();
  typeToSchemaMapping = {};

  constructor(schemaDir: string) {
    this.schemaDir = path.resolve(schemaDir);
  }

  /**
   * Find a Zod schema by name and convert it to OpenAPI spec
   */
  convertZodSchemaToOpenApi(schemaName: string): OpenApiSchema | null {
    // Run pre-scan only one time
    if (Object.keys(this.typeToSchemaMapping).length === 0) {
      this.preScanForTypeMappings();
    }

    console.log(`Looking for Zod schema: ${schemaName}`);

    // Check mapped types
    const mappedSchemaName = this.typeToSchemaMapping[schemaName];
    if (mappedSchemaName) {
      console.log(
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
          console.log(
            `Found Zod schema '${schemaName}' in route file: ${routeFile}`
          );
          return this.zodSchemas[schemaName];
        }
      }

      // Scan schema directory
      this.scanDirectoryForZodSchema(this.schemaDir, schemaName);

      // Return the schema if found, or null if not
      if (this.zodSchemas[schemaName]) {
        console.log(`Found and processed Zod schema: ${schemaName}`);
        return this.zodSchemas[schemaName];
      }

      console.log(`Could not find Zod schema: ${schemaName}`);
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
      console.error(`Error scanning directory ${dir} for route files:`, error);
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
      console.error(`Error scanning directory ${dir}:`, error);
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
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      // Create a map to store imported modules
      const importedModules: Record<string, string> = {};

      // Look for all exported Zod schemas
      traverse.default(ast, {
        // Track imports for resolving local and imported schemas
        ImportDeclaration: (path) => {
          // Keep track of imports to resolve external schemas
          const source = path.node.source.value;

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

        // For export const SchemaName = z.object({...})
        ExportNamedDeclaration: (path) => {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration) => {
              if (
                t.isIdentifier(declaration.id) &&
                declaration.id.name === schemaName &&
                declaration.init
              ) {
                // Check if this is a call expression with .extend()
                if (
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
                  console.log(
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
      console.error(
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
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      traverse.default(ast, {
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
      console.error(
        `Error processing all schemas in file ${filePath}: ${error}`
      );
    }
  }

  /**
   * Process a Zod node and convert it to OpenAPI schema
   */
  processZodNode(node: t.Node): OpenApiSchema {
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

    console.warn("Unknown Zod schema node:", node);
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
          console.log(`Skipping property ${index} - unsupported key type`);
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
      // @ts-ignore
      schema.required = required;
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
        schema.nullable = true;
        break;
      case "nullable":
        schema.nullable = true;
        break;
      case "nullish": // Handles both null and undefined
        schema.nullable = true;
        break;
      case "describe":
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          schema.description = node.arguments[0].value;
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
          const baseSchema = this.processZodNode(node.callee.object);

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
            console.log(`Warning: Could not resolve base schema for extend`);
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
        node.callee.property.name === "nullable" ||
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
    console.log("Pre-scanning for type mappings...");

    // Scan route files
    const routeFiles = this.findRouteFiles();
    for (const routeFile of routeFiles) {
      this.scanFileForTypeMappings(routeFile);
    }

    // Scan schema directory
    this.scanDirectoryForTypeMappings(this.schemaDir);
  }

  /**
   * Scan a single file for type mappings
   */
  scanFileForTypeMappings(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      traverse.default(ast, {
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
                  console.log(
                    `Pre-scan: Mapped type '${typeName}' to schema '${referencedSchemaName}'`
                  );
                }
              }
            }
          }
        },
      });
    } catch (error) {
      console.error(
        `Error scanning file ${filePath} for type mappings:`,
        error
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
      console.error(
        `Error scanning directory ${dir} for type mappings:`,
        error
      );
    }
  }

  /**
   * Pre-process all Zod schemas in a file
   */
  preprocessAllSchemasInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      // Collect all exported Zod schemas
      traverse.default(ast, {
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
                  console.log(`Pre-processing Zod schema: ${schemaName}`);
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
      console.error(`Error pre-processing file ${filePath}:`, error);
    }
  }

  /**
   * Check if node is Zod schema
   */
  isZodSchema(node) {
    if (t.isCallExpression(node)) {
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.object) &&
        node.callee.object.name === "z"
      ) {
        return true;
      }
      if (
        t.isMemberExpression(node.callee) &&
        t.isCallExpression(node.callee.object)
      ) {
        return this.isZodSchema(node.callee.object);
      }
    }
    return false;
  }
}
