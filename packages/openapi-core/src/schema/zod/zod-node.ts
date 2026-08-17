import * as t from "@babel/types";

import { logger } from "../../shared/logger.js";
import type { OpenApiSchema } from "../../shared/types.js";
import { DrizzleZodProcessor } from "./drizzle-zod-processor.js";
import { FUNCTIONAL_WRAPPER_HELPERS } from "./functional-checks.js";
import { applyNullableWrapper } from "./nullability.js";

export type ZodNodeHost = {
  convertZodSchemaToOpenApi: (schemaName: string) => OpenApiSchema | null;
  currentAST: t.File | null | undefined;
  currentContentType: string;
  currentFilePath: string;
  currentImports: Record<string, string>;
  currentSchemaUsedRuntimeExport: boolean;
  drizzleZodImports: Set<string>;
  expandFactoryCall: (
    factoryNode: t.Node,
    callNode: t.CallExpression,
    filePath: string,
  ) => OpenApiSchema | null;
  findFactoryFunction: (
    name: string,
    filePath: string,
    ast: t.File,
    imports: Record<string, string>,
  ) => t.Node | null;
  getCurrentZodLocalName: () => string;
  getSchemaReferenceName: (schemaName: string) => string;
  getStoredSchema: (schemaName: string) => OpenApiSchema | undefined;
  isZodLocalName: (name: string) => boolean;
  parseFileWithCache: (filePath: string) => t.File;
  applyZodChainMethod: (
    schema: OpenApiSchema,
    methodName: string,
    node: t.CallExpression,
  ) => OpenApiSchema;
  processZodChain: (node: t.CallExpression) => OpenApiSchema;
  processZodDiscriminatedUnion: (node: t.CallExpression) => OpenApiSchema;
  processZodFunctionalWrapper: (methodName: string, node: t.CallExpression) => OpenApiSchema;
  processZodIntersection: (node: t.CallExpression) => OpenApiSchema;
  processZodLazy: (node: t.CallExpression) => OpenApiSchema;
  processZodLiteral: (node: t.CallExpression) => OpenApiSchema;
  processZodObject: (node: t.CallExpression) => OpenApiSchema;
  processZodPrimitive: (node: t.CallExpression) => OpenApiSchema;
  processZodTuple: (node: t.CallExpression) => OpenApiSchema;
  processZodUnion: (node: t.CallExpression) => OpenApiSchema;
  resolveImportPath: (currentFilePath: string, importSource: string) => string | null;
  runtimeExporter: {
    exportSchema: (
      node: t.Node,
      options: { contentType: string; zodLocalName: string },
    ) => OpenApiSchema | null;
  };
  shouldUseRuntimeExport: (node: t.Node) => boolean;
  warnIfUnknownZodHelper: (helperName: string) => void;
};

export function convertZodNode(converter: ZodNodeHost, node: t.Node): OpenApiSchema {
  // Handle drizzle-zod helper functions (e.g., createInsertSchema, createSelectSchema)
  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    converter.drizzleZodImports.has(node.callee.name)
  ) {
    return DrizzleZodProcessor.processSchema(node, {
      currentAST: converter.currentAST ?? undefined,
      currentFilePath: converter.currentFilePath,
      importedModules: converter.currentImports,
      parseFileWithCache: (filePath) => converter.parseFileWithCache(filePath),
      resolveImportPath: (currentFilePath, importSource) =>
        converter.resolveImportPath(currentFilePath, importSource),
    });
  }

  if (converter.shouldUseRuntimeExport(node)) {
    const runtimeSchema = converter.runtimeExporter.exportSchema(node, {
      contentType: converter.currentContentType,
      zodLocalName: converter.getCurrentZodLocalName(),
    });
    if (runtimeSchema) {
      converter.currentSchemaUsedRuntimeExport = true;
      return runtimeSchema;
    }
  }

  // Handle reference to another schema (e.g. UserBaseSchema.extend)
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "extend" &&
    !converter.isZodLocalName(node.callee.object.name)
  ) {
    const baseSchemaName = node.callee.object.name;

    // Check if the base schema already exists
    if (!converter.getStoredSchema(baseSchemaName)) {
      // Try to find the basic pattern
      converter.convertZodSchemaToOpenApi(baseSchemaName);
    }

    return converter.processZodChain(node);
  }

  // Handle z.coerce.TYPE() patterns
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isMemberExpression(node.callee.object) &&
    t.isIdentifier(node.callee.object.object) &&
    converter.isZodLocalName(node.callee.object.object.name) &&
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

    return converter.processZodPrimitive(syntheticNode);
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

    if (t.isIdentifier(currentObject) && converter.isZodLocalName(currentObject.name)) {
      return converter.processZodPrimitive(node);
    }
  }

  // Handle z.object({...})
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    converter.isZodLocalName(node.callee.object.name) &&
    t.isIdentifier(node.callee.property)
  ) {
    const methodName = node.callee.property.name;

    if ((methodName === "object" || methodName === "strictObject") && node.arguments.length > 0) {
      const schema = converter.processZodObject(node);
      if (methodName === "strictObject") {
        schema.additionalProperties = false;
      }
      return schema;
    } else if (methodName === "union" && node.arguments.length > 0) {
      return converter.processZodUnion(node);
    } else if (methodName === "intersection" && node.arguments.length > 0) {
      return converter.processZodIntersection(node);
    } else if (methodName === "tuple" && node.arguments.length > 0) {
      return converter.processZodTuple(node);
    } else if (methodName === "discriminatedUnion" && node.arguments.length > 1) {
      return converter.processZodDiscriminatedUnion(node);
    } else if (methodName === "literal" && node.arguments.length > 0) {
      return converter.processZodLiteral(node);
    } else if (methodName === "optional" && node.arguments.length > 0) {
      const firstArgument = node.arguments[0];
      if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
        return { type: "object" };
      }
      return convertZodNode(converter, firstArgument);
    } else if (methodName === "nullable" && node.arguments.length > 0) {
      const firstArgument = node.arguments[0];
      if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
        return { type: "object" };
      }
      return applyNullableWrapper(convertZodNode(converter, firstArgument));
    } else if (methodName === "nullish" && node.arguments.length > 0) {
      const firstArgument = node.arguments[0];
      if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
        return { type: "object" };
      }
      return applyNullableWrapper(convertZodNode(converter, firstArgument));
    } else if (FUNCTIONAL_WRAPPER_HELPERS.has(methodName)) {
      return converter.processZodFunctionalWrapper(methodName, node);
    } else {
      converter.warnIfUnknownZodHelper(methodName);
      return converter.processZodPrimitive(node);
    }
  }

  // Handle schema reference with method calls, e.g., Image.optional(), UserSchema.nullable()
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    t.isIdentifier(node.callee.property) &&
    !converter.isZodLocalName(node.callee.object.name) // Make sure it's not a z.* call
  ) {
    const schemaName = node.callee.object.name;
    const methodName = node.callee.property.name;

    // Process base schema first if not already processed
    if (!converter.getStoredSchema(schemaName)) {
      converter.convertZodSchemaToOpenApi(schemaName);
    }

    // If the schema exists, create a reference and apply the method
    if (converter.getStoredSchema(schemaName)) {
      let schema: OpenApiSchema = {
        allOf: [{ $ref: `#/components/schemas/${converter.getSchemaReferenceName(schemaName)}` }],
      };

      // Apply method-specific transformations
      switch (methodName) {
        case "optional":
          // optional means T | undefined — not in required array, no nullable flag
          break;
        case "nullable":
        case "nullish":
          // Transform allOf to anyOf with null branch to preserve null type
          schema = {
            anyOf: [
              { $ref: `#/components/schemas/${converter.getSchemaReferenceName(schemaName)}` },
              { type: "null" },
            ],
          };
          break;
        case "describe":
          if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
            schema.description = node.arguments[0].value;
          }
          break;
        default:
          // Clone the stored object so omit/pick/extend mutate properties, not a $ref.
          return converter.applyZodChainMethod(
            structuredClone(converter.getStoredSchema(schemaName) ?? { type: "object" }),
            methodName,
            node,
          );
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
    return converter.processZodChain(node);
  }

  // Handle schema references like z.lazy(() => AnotherSchema)
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    converter.isZodLocalName(node.callee.object.name) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "lazy" &&
    node.arguments.length > 0
  ) {
    return converter.processZodLazy(node);
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
    const currentFilePath = converter.currentFilePath;
    const currentAST = converter.currentAST;
    const importedModules = converter.currentImports;

    if (currentFilePath && currentAST && importedModules) {
      const factoryNode = converter.findFactoryFunction(
        node.callee.name,
        currentFilePath,
        currentAST,
        importedModules,
      );

      if (factoryNode) {
        logger.debug(`[processZodNode] Found factory function, expanding...`);
        const schema = converter.expandFactoryCall(factoryNode, node, currentFilePath);
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
    if (!converter.getStoredSchema(schemaName)) {
      converter.convertZodSchemaToOpenApi(schemaName);
    }

    // Return a reference to the schema
    return { $ref: `#/components/schemas/${converter.getSchemaReferenceName(schemaName)}` };
  }

  logger.debug("Unknown Zod schema node:", node);
  return { type: "object" };
}
