import * as t from "@babel/types";
import { logger } from "../../shared/logger.js";
import { resolveTypeScriptModule } from "../../shared/typescript-project.js";
import type { OpenApiSchema } from "../../shared/types.js";

type DrizzleZodProcessingContext = {
  currentAST?: t.File | undefined;
  currentFilePath?: string | undefined;
  importedModules?: Record<string, string> | undefined;
  parseFileWithCache?: ((filePath: string) => t.File | null) | undefined;
  resolveImportPath?:
    | ((currentFilePath: string, importSource: string) => string | null)
    | undefined;
};

type DrizzleColumnMetadata = {
  hasDefault: boolean;
  isGenerated: boolean;
  isNotNull: boolean;
  schema: OpenApiSchema;
};

/**
 * Processor for drizzle-zod schemas
 *
 * Drizzle-zod is a library that generates Zod schemas from Drizzle ORM table definitions.
 * It provides helper functions like:
 * - createInsertSchema(tableDefinition, refinements)
 * - createSelectSchema(tableDefinition, refinements)
 *
 * This processor extracts field definitions and refinements to generate OpenAPI schemas.
 */
export class DrizzleZodProcessor {
  /**
   * Known drizzle-zod helper function names
   */
  static readonly DRIZZLE_ZOD_HELPERS = [
    "createInsertSchema",
    "createSelectSchema",
    "createUpdateSchema",
  ];

  /**
   * Process a drizzle-zod schema node
   *
   * @param node - The CallExpression node representing a drizzle-zod function call
   * @returns OpenAPI schema object
   */
  static processSchema(
    node: t.CallExpression,
    context: DrizzleZodProcessingContext = {},
  ): OpenApiSchema {
    const functionName = t.isIdentifier(node.callee) ? node.callee.name : "unknown";

    logger.debug(`Processing drizzle-zod schema: ${functionName}`);

    const schema = this.createBaseSchema(functionName, node.arguments[0], context);
    const properties = schema.properties;
    const required = new Set(schema.required ?? []);

    // Check if there's a refinements object (second argument)
    if (node.arguments.length > 1 && t.isObjectExpression(node.arguments[1])) {
      const refinements = node.arguments[1];
      if (!properties) {
        return { type: "object" };
      }

      // Process each property in the refinements object
      refinements.properties.forEach((prop) => {
        if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
          const key = this.extractPropertyKey(prop);
          if (!key) return;

          // The value is typically an arrow function: (schema) => schema.field.method()
          if (t.isObjectProperty(prop) && t.isArrowFunctionExpression(prop.value)) {
            const arrowFunc = prop.value;
            const firstParam = arrowFunc.params[0];
            const parameterName = t.isIdentifier(firstParam) ? firstParam.name : null;
            const fieldSchema = this.extractFieldSchema(arrowFunc.body, key, parameterName);

            if (fieldSchema) {
              properties[key] = {
                ...properties[key],
                ...fieldSchema,
              };

              // Determine if field is required based on schema modifiers
              if (functionName === "createSelectSchema") {
                required.add(key);
              } else if (this.isFieldOptional(arrowFunc.body)) {
                required.delete(key);
              } else {
                required.add(key);
              }
            }
          }
        }
      });
    }

    // If no properties were extracted, return a generic object schema
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      logger.debug("No properties extracted from drizzle-zod schema, returning generic object");
      return { type: "object" };
    }

    return required.size > 0 ? { ...schema, required: [...required] } : { ...schema, required: [] };
  }

  private static createBaseSchema(
    functionName: string,
    tableArgument: t.CallExpression["arguments"][number] | undefined,
    context: DrizzleZodProcessingContext,
  ): OpenApiSchema {
    if (functionName !== "createSelectSchema") {
      return {
        type: "object",
        properties: {},
        required: [],
      };
    }

    const tableCall = tableArgument ? this.resolveTableCall(tableArgument, context) : null;
    const schema = tableCall ? this.extractSelectSchemaFromTable(tableCall) : null;
    if (schema) {
      return schema;
    }

    return {
      type: "object",
      properties: {},
      required: [],
    };
  }

  private static resolveTableCall(
    node: t.ArgumentPlaceholder | t.SpreadElement | t.Expression,
    context: DrizzleZodProcessingContext,
  ): t.CallExpression | null {
    if (t.isCallExpression(node) && this.isPgTableCall(node)) {
      return node;
    }

    if (!t.isIdentifier(node)) {
      return null;
    }

    const localDeclaration = this.findVariableInitializer(context.currentAST, node.name);
    if (t.isCallExpression(localDeclaration) && this.isPgTableCall(localDeclaration)) {
      return localDeclaration;
    }

    const importSource = context.importedModules?.[node.name];
    if (!importSource || !context.currentFilePath) {
      return null;
    }

    const resolvedPath =
      context.resolveImportPath?.(context.currentFilePath, importSource) ||
      resolveTypeScriptModule(importSource, context.currentFilePath);
    if (!resolvedPath) {
      return null;
    }

    const importedAst = context.parseFileWithCache?.(resolvedPath);
    const importedDeclaration = this.findVariableInitializer(importedAst ?? undefined, node.name);
    return t.isCallExpression(importedDeclaration) && this.isPgTableCall(importedDeclaration)
      ? importedDeclaration
      : null;
  }

  private static findVariableInitializer(
    ast: t.File | undefined,
    name: string,
  ): t.Expression | null {
    if (!ast) {
      return null;
    }

    for (const statement of ast.program.body) {
      const declaration =
        t.isExportNamedDeclaration(statement) && statement.declaration
          ? statement.declaration
          : statement;

      if (!t.isVariableDeclaration(declaration)) {
        continue;
      }

      for (const declarator of declaration.declarations) {
        if (
          t.isIdentifier(declarator.id, { name }) &&
          declarator.init &&
          t.isExpression(declarator.init)
        ) {
          return declarator.init;
        }
      }
    }

    return null;
  }

  private static isPgTableCall(node: t.CallExpression): boolean {
    return t.isIdentifier(node.callee, { name: "pgTable" });
  }

  private static extractSelectSchemaFromTable(node: t.CallExpression): OpenApiSchema | null {
    const columnsArgument = node.arguments[1];
    if (!t.isObjectExpression(columnsArgument)) {
      return null;
    }

    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];

    columnsArgument.properties.forEach((property) => {
      if (!t.isObjectProperty(property)) {
        return;
      }

      const key = this.extractPropertyKey(property);
      if (!key || !t.isExpression(property.value)) {
        return;
      }

      const column = this.extractColumnMetadata(property.value);
      if (!column) {
        return;
      }

      properties[key] = {
        ...column.schema,
        ...(column.isNotNull ? {} : { nullable: true }),
      };
      required.push(key);
    });

    return {
      type: "object",
      properties,
      required,
    };
  }

  private static extractColumnMetadata(node: t.Expression): DrizzleColumnMetadata | null {
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
      const baseMetadata = this.extractColumnMetadata(node.callee.object as t.Expression);
      if (!baseMetadata) {
        return null;
      }

      const methodName = t.isIdentifier(node.callee.property) ? node.callee.property.name : null;
      if (!methodName) {
        return baseMetadata;
      }

      switch (methodName) {
        case "notNull":
          return { ...baseMetadata, isNotNull: true };
        case "default":
        case "defaultNow":
          return { ...baseMetadata, hasDefault: true };
        case "primaryKey":
          return { ...baseMetadata, isNotNull: true };
        default:
          return baseMetadata;
      }
    }

    if (!t.isCallExpression(node) || !t.isIdentifier(node.callee)) {
      return null;
    }

    const factoryName = node.callee.name;
    const schema = this.mapDrizzleColumnFactoryToOpenApi(factoryName, node.arguments);
    if (!schema) {
      return null;
    }

    return {
      schema,
      hasDefault: factoryName === "serial",
      isGenerated: factoryName === "serial",
      isNotNull: factoryName === "serial",
    };
  }

  private static mapDrizzleColumnFactoryToOpenApi(
    factoryName: string,
    args: (t.ArgumentPlaceholder | t.SpreadElement | t.Expression)[],
  ): OpenApiSchema | null {
    switch (factoryName) {
      case "serial":
      case "integer":
      case "smallint":
      case "bigint":
        return { type: "integer" };
      case "numeric":
      case "real":
      case "doublePrecision":
      case "decimal":
        return { type: "number" };
      case "boolean":
        return { type: "boolean" };
      case "timestamp":
      case "datetime":
        return { type: "string", format: "date-time" };
      case "date":
        return { type: "string", format: "date" };
      case "text":
        return { type: "string" };
      case "varchar":
      case "char":
      case "textEnum":
      case "pgEnum":
      case "uuid":
        return this.buildStringColumnSchema(factoryName, args);
      default:
        return null;
    }
  }

  private static buildStringColumnSchema(
    factoryName: string,
    args: (t.ArgumentPlaceholder | t.SpreadElement | t.Expression)[],
  ): OpenApiSchema {
    const schema: OpenApiSchema = { type: "string" };

    if (factoryName === "uuid") {
      schema.format = "uuid";
      return schema;
    }

    const options = args[1];
    if (t.isObjectExpression(options)) {
      const lengthProperty = options.properties.find(
        (property) =>
          t.isObjectProperty(property) && t.isIdentifier(property.key, { name: "length" }),
      );

      if (
        lengthProperty &&
        t.isObjectProperty(lengthProperty) &&
        t.isNumericLiteral(lengthProperty.value)
      ) {
        schema.maxLength = lengthProperty.value.value;
      }
    }

    return schema;
  }

  /**
   * Extract property key from object property or method
   */
  private static extractPropertyKey(prop: t.ObjectProperty | t.ObjectMethod): string | null {
    if (t.isIdentifier(prop.key)) {
      return prop.key.name;
    }
    if (t.isStringLiteral(prop.key)) {
      return prop.key.value;
    }
    return null;
  }

  /**
   * Extract OpenAPI schema from a drizzle-zod field refinement
   *
   * Handles patterns like:
   * - schema.field
   * - schema.field.min(1)
   * - schema.min(1)
   * - schema.field.min(1).max(100).email()
   * - schema.min(1).max(100).email()
   */
  private static extractFieldSchema(
    node: t.Node,
    fieldKey: string,
    parameterName: string | null,
  ): OpenApiSchema | null {
    // Handle drizzle-zod callbacks where the parameter is already the field schema:
    // title: (schema) => schema.min(5).describe("Post title")
    if (parameterName && t.isIdentifier(node, { name: parameterName })) {
      return this.mapFieldTypeToOpenApi(fieldKey);
    }

    // Handle member expressions like: schema.field
    if (t.isMemberExpression(node)) {
      if (t.isIdentifier(node.property)) {
        const fieldType = node.property.name;
        return this.mapFieldTypeToOpenApi(fieldType);
      }
    }

    // Handle call expressions (chained methods like schema.field.min(1).max(100))
    if (t.isCallExpression(node)) {
      const baseSchema = this.extractFieldSchema(
        t.isMemberExpression(node.callee) ? node.callee.object : node,
        fieldKey,
        parameterName,
      );

      if (baseSchema && t.isMemberExpression(node.callee)) {
        const methodName = t.isIdentifier(node.callee.property) ? node.callee.property.name : null;

        if (methodName) {
          return this.applyZodMethod(baseSchema, methodName, node.arguments);
        }
      }

      return baseSchema;
    }

    return null;
  }

  /**
   * Check if a drizzle-zod field is optional
   */
  private static isFieldOptional(node: t.Node): boolean {
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
      const methodName = t.isIdentifier(node.callee.property) ? node.callee.property.name : null;

      if (methodName === "optional" || methodName === "nullish") {
        return true;
      }

      // Check parent chain recursively
      return this.isFieldOptional(node.callee.object);
    }

    return false;
  }

  /**
   * Map Drizzle field types to OpenAPI types
   *
   * This provides intelligent mapping based on common field naming patterns.
   * For more accurate type detection, the drizzle table schema would need to be analyzed.
   */
  private static mapFieldTypeToOpenApi(fieldType: string): OpenApiSchema {
    // Common mappings based on field naming conventions
    const lowercaseField = fieldType.toLowerCase();

    // String types
    if (
      lowercaseField.includes("title") ||
      lowercaseField.includes("name") ||
      lowercaseField.includes("description") ||
      lowercaseField.includes("content") ||
      lowercaseField.includes("text") ||
      lowercaseField.includes("slug") ||
      lowercaseField.includes("email") ||
      lowercaseField.includes("url") ||
      lowercaseField.includes("phone")
    ) {
      const schema: OpenApiSchema = { type: "string" };

      // Add format hints
      if (lowercaseField.includes("email")) {
        schema.format = "email";
      } else if (lowercaseField.includes("url") || lowercaseField.includes("uri")) {
        schema.format = "uri";
      } else if (lowercaseField.includes("uuid")) {
        schema.format = "uuid";
      }

      return schema;
    }

    // Integer types
    if (
      lowercaseField.includes("id") ||
      lowercaseField.includes("count") ||
      lowercaseField.includes("stock") ||
      lowercaseField.includes("quantity") ||
      lowercaseField.includes("age") ||
      lowercaseField.includes("year")
    ) {
      return { type: "integer" };
    }

    // Number types
    if (
      lowercaseField.includes("price") ||
      lowercaseField.includes("amount") ||
      lowercaseField.includes("rate") ||
      lowercaseField.includes("percent")
    ) {
      return { type: "number" };
    }

    // Boolean types
    if (
      lowercaseField.startsWith("is") ||
      lowercaseField.startsWith("has") ||
      lowercaseField.includes("active") ||
      lowercaseField.includes("enabled") ||
      lowercaseField.includes("published")
    ) {
      return { type: "boolean" };
    }

    // Date/time types
    if (
      lowercaseField.includes("date") ||
      lowercaseField.includes("time") ||
      lowercaseField.includes("createdat") ||
      lowercaseField.includes("updatedat") ||
      lowercaseField.includes("deletedat")
    ) {
      return { type: "string", format: "date-time" };
    }

    // Default to string for unknown types
    return { type: "string" };
  }

  /**
   * Apply a Zod validation method to a schema
   *
   * Translates Zod validation methods to OpenAPI constraints:
   * - min/max for strings become minLength/maxLength
   * - min/max for numbers become minimum/maximum
   * - email/url/uuid become format constraints
   */
  private static applyZodMethod(
    schema: OpenApiSchema,
    methodName: string,
    args: (t.ArgumentPlaceholder | t.SpreadElement | t.Expression)[],
  ): OpenApiSchema {
    const result = { ...schema };

    switch (methodName) {
      case "min":
        if (args.length > 0 && t.isNumericLiteral(args[0])) {
          if (schema.type === "string") {
            result.minLength = args[0].value;
          } else if (schema.type === "number" || schema.type === "integer") {
            result.minimum = args[0].value;
          } else if (schema.type === "array") {
            result.minItems = args[0].value;
          }
        }
        break;

      case "max":
        if (args.length > 0 && t.isNumericLiteral(args[0])) {
          if (schema.type === "string") {
            result.maxLength = args[0].value;
          } else if (schema.type === "number" || schema.type === "integer") {
            result.maximum = args[0].value;
          } else if (schema.type === "array") {
            result.maxItems = args[0].value;
          }
        }
        break;

      case "length":
        if (args.length > 0 && t.isNumericLiteral(args[0])) {
          if (schema.type === "string") {
            result.minLength = args[0].value;
            result.maxLength = args[0].value;
          } else if (schema.type === "array") {
            result.minItems = args[0].value;
            result.maxItems = args[0].value;
          }
        }
        break;

      case "email":
        result.format = "email";
        break;

      case "url":
        result.format = "uri";
        break;

      case "uuid":
        result.format = "uuid";
        break;

      case "datetime":
        result.format = "date-time";
        break;

      case "regex":
        if (args.length > 0) {
          // Try to extract pattern from regex literal
          if (t.isRegExpLiteral(args[0])) {
            result.pattern = args[0].pattern;
          }
        }
        break;

      case "positive":
        if (schema.type === "number" || schema.type === "integer") {
          result.minimum = 0;
          result.exclusiveMinimum = true;
        }
        break;

      case "nonnegative":
        if (schema.type === "number" || schema.type === "integer") {
          result.minimum = 0;
        }
        break;

      case "negative":
        if (schema.type === "number" || schema.type === "integer") {
          result.maximum = 0;
          result.exclusiveMaximum = true;
        }
        break;

      case "nonpositive":
        if (schema.type === "number" || schema.type === "integer") {
          result.maximum = 0;
        }
        break;

      case "int":
        result.type = "integer";
        break;

      case "optional":
        // Handled by isFieldOptional check, no schema modification needed
        break;
      case "nullable":
        result.nullable = true;
        break;
      case "nullish":
        result.nullable = true;
        break;

      case "describe":
        if (args.length > 0 && t.isStringLiteral(args[0])) {
          result.description = args[0].value;
        }
        break;

      case "default":
        if (args.length > 0) {
          // Extract default value
          if (t.isStringLiteral(args[0])) {
            result.default = args[0].value;
          } else if (t.isNumericLiteral(args[0])) {
            result.default = args[0].value;
          } else if (t.isBooleanLiteral(args[0])) {
            result.default = args[0].value;
          }
        }
        break;
    }

    return result;
  }

  /**
   * Check if a function name is a drizzle-zod helper
   */
  static isDrizzleZodHelper(name: string): boolean {
    return this.DRIZZLE_ZOD_HELPERS.includes(name);
  }
}
