import type fs from "fs";
import path from "path";

import { parseTypeScriptFile } from "../../shared/utils.js";
import type { ContentType, OpenAPIDefinition } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

type TypeDefinitionEntry = {
  node?: any;
  filePath?: string;
};

export type UtilityTypeResolverContext = {
  currentFilePath: string;
  contentType: ContentType;
  importMap: Record<string, Record<string, string>>;
  typeDefinitions: Record<string, any>;
  fileAccess: Pick<typeof fs, "readFileSync">;
  resolveImportPath: (importPath: string, fromFilePath: string) => string | null;
  resolveTSNodeType: (node: any) => OpenAPIDefinition;
  findSchemaDefinition: (schemaName: string, contentType: ContentType) => OpenAPIDefinition;
  collectImports: (ast: any, filePath: string) => void;
  collectTypeDefinitions: (ast: any, schemaName: string, filePath?: string) => void;
  collectAllExportedDefinitions: (ast: any, filePath?: string) => void;
  extractFunctionReturnType: (node: any) => any;
  extractFunctionParameters: (node: any) => any[];
  extractKeysFromLiteralType: (node: any) => string[];
  resolveGenericType: (
    genericTypeDefinition: any,
    typeParams: any[],
    typeName: string,
  ) => OpenAPIDefinition;
  processingTypes: Set<string>;
  findTypeDefinition: (typeName: string) => void;
  resolveType: (typeName: string) => OpenAPIDefinition;
  setResolvingPickOmitBase: (value: boolean) => void;
};

function getTypeDefinitionNode(entry: unknown): any {
  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const maybeEntry = entry as TypeDefinitionEntry;
  return maybeEntry.node || entry;
}

function resolveFunctionNodeFromQuery(funcName: string, context: UtilityTypeResolverContext): any {
  const savedFilePath = context.currentFilePath;

  context.findSchemaDefinition(funcName, context.contentType);
  let funcDefEntry = context.typeDefinitions[funcName];
  let funcNode = getTypeDefinitionNode(funcDefEntry);

  const normalizedSourcePath = path.normalize(savedFilePath);
  if (!funcNode && savedFilePath && context.importMap[normalizedSourcePath]) {
    const importPath = context.importMap[normalizedSourcePath][funcName];
    if (importPath) {
      const resolvedPath = context.resolveImportPath(importPath, savedFilePath);
      if (resolvedPath) {
        const content = context.fileAccess.readFileSync(resolvedPath, "utf-8");
        const ast = parseTypeScriptFile(content);

        context.collectImports(ast, resolvedPath);
        context.collectTypeDefinitions(ast, funcName, resolvedPath);
        context.collectAllExportedDefinitions(ast, resolvedPath);

        funcDefEntry = context.typeDefinitions[funcName];
        funcNode = getTypeDefinitionNode(funcDefEntry);
      }
    }
  }

  return funcNode;
}

function resolveReturnTypeUtility(
  node: any,
  context: UtilityTypeResolverContext,
): OpenAPIDefinition {
  const typeParam = node.typeParameters?.params[0];
  if (!typeParam) {
    return { type: "object" };
  }

  if (typeParam.type !== "TSTypeQuery") {
    logger.warn(
      `ReturnType<T>: Expected 'typeof functionName' but got a different type. ` +
        `Use ReturnType<typeof yourFunction> pattern for best results.`,
    );
    return context.resolveTSNodeType(typeParam);
  }

  const funcName = typeParam.exprName?.type === "Identifier" ? typeParam.exprName.name : null;
  if (!funcName) {
    return { type: "object" };
  }

  const funcNode = resolveFunctionNodeFromQuery(funcName, context);
  if (!funcNode) {
    logger.warn(
      `ReturnType<typeof ${funcName}>: Function '${funcName}' not found in schema files or imports. ` +
        `Ensure the function is exported and imported correctly.`,
    );
    return { type: "object" };
  }

  const returnTypeNode = context.extractFunctionReturnType(funcNode);
  if (!returnTypeNode) {
    logger.warn(
      `ReturnType<typeof ${funcName}>: Function '${funcName}' does not have an explicit return type annotation. ` +
        `Add a return type to the function signature for accurate schema generation.`,
    );
    return { type: "object" };
  }

  return context.resolveTSNodeType(returnTypeNode);
}

function resolveParametersUtility(
  node: any,
  context: UtilityTypeResolverContext,
): OpenAPIDefinition {
  const typeParam = node.typeParameters?.params[0];
  if (!typeParam || typeParam.type !== "TSTypeQuery") {
    return { type: "array", items: { type: "object" } };
  }

  const funcName = typeParam.exprName?.type === "Identifier" ? typeParam.exprName.name : null;
  if (!funcName) {
    return { type: "array", items: { type: "object" } };
  }

  const funcNode = resolveFunctionNodeFromQuery(funcName, context);
  if (!funcNode) {
    logger.warn(
      `Parameters<typeof ${funcName}>: Function '${funcName}' not found in schema files or imports.`,
    );
    return { type: "array", items: { type: "object" } };
  }

  const params = context.extractFunctionParameters(funcNode);
  if (!params || params.length === 0) {
    return {
      type: "array",
      maxItems: 0,
    };
  }

  const paramTypes = params.map((param: any) => {
    if (param.typeAnnotation && param.typeAnnotation.typeAnnotation) {
      return context.resolveTSNodeType(param.typeAnnotation.typeAnnotation);
    }
    return { type: "any" };
  });

  return {
    type: "array",
    prefixItems: paramTypes,
    items: false,
    minItems: paramTypes.length,
    maxItems: paramTypes.length,
  };
}

function resolvePickOmitUtility(
  typeName: "Pick" | "Omit",
  node: any,
  context: UtilityTypeResolverContext,
): OpenAPIDefinition {
  if (node.typeParameters?.params.length > 1) {
    const baseTypeParam = node.typeParameters.params[0];
    const keysParam = node.typeParameters.params[1];

    context.setResolvingPickOmitBase(true);
    const baseType = context.resolveTSNodeType(baseTypeParam);
    context.setResolvingPickOmitBase(false);

    if (baseType.properties) {
      const baseProperties = baseType.properties;
      const properties: Record<string, any> = {};
      const keyNames = context.extractKeysFromLiteralType(keysParam);

      if (typeName === "Pick") {
        keyNames.forEach((key) => {
          if (baseProperties[key]) {
            properties[key] = baseProperties[key];
          }
        });
      } else {
        Object.entries(baseProperties).forEach(([key, value]) => {
          if (!keyNames.includes(key)) {
            properties[key] = value;
          }
        });
      }

      return { type: "object", properties };
    }
  }

  if (node.typeParameters?.params.length > 0) {
    return context.resolveTSNodeType(node.typeParameters.params[0]);
  }

  return { type: "object" };
}

export function resolveUtilityTypeReference(
  node: any,
  context: UtilityTypeResolverContext,
): OpenAPIDefinition | null {
  const typeName = node.typeName?.type === "Identifier" ? node.typeName.name : null;
  if (!typeName) {
    return null;
  }

  if (typeName === "Partial" || typeName === "Required" || typeName === "Readonly") {
    if (node.typeParameters?.params.length > 0) {
      return context.resolveTSNodeType(node.typeParameters.params[0]);
    }
    return { type: "object" };
  }

  if (typeName === "Awaited") {
    if (node.typeParameters?.params.length > 0) {
      return context.resolveTSNodeType(node.typeParameters.params[0]);
    }
    return { type: "object" };
  }

  if (typeName === "ReturnType") {
    return resolveReturnTypeUtility(node, context);
  }

  if (typeName === "Parameters") {
    return resolveParametersUtility(node, context);
  }

  if (typeName === "Pick" || typeName === "Omit") {
    return resolvePickOmitUtility(typeName, node, context);
  }

  if (node.typeParameters?.params.length > 0) {
    context.findTypeDefinition(typeName);
    const genericDefEntry = context.typeDefinitions[typeName];
    const genericTypeDefinition = getTypeDefinitionNode(genericDefEntry);

    if (genericTypeDefinition) {
      return context.resolveGenericType(
        genericTypeDefinition,
        node.typeParameters.params,
        typeName,
      );
    }
  }

  if (context.processingTypes.has(typeName)) {
    return { $ref: `#/components/schemas/${typeName}` };
  }

  context.findTypeDefinition(typeName);
  return context.resolveType(typeName);
}
