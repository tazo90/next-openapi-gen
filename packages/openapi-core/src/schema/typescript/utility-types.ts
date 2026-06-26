import type fs from "fs";
import path from "path";

import * as t from "@babel/types";

import { logger } from "../../shared/logger.js";
import type { SymbolResolver } from "../../shared/symbol-resolver.js";
import type { ContentType, OpenAPIDefinition } from "../../shared/types.js";
import { parseTypeScriptFile } from "../../shared/utils.js";

type TypeDefinitionEntry = {
  node?: any;
  filePath?: string;
};

type UtilityTypeResolverContext = {
  currentFilePath: string;
  contentType: ContentType;
  importMap: Record<string, Record<string, string>>;
  typeDefinitions: Record<string, any>;
  fileAccess: Pick<typeof fs, "readFileSync">;
  resolveImportPath: (importPath: string, fromFilePath: string) => string | null;
  resolveTSNodeType: (node: any) => OpenAPIDefinition;
  symbolResolver?: SymbolResolver;
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
        const ast = readASTForUtilityContext(resolvedPath, context);
        if (ast) {
          context.collectImports(ast, resolvedPath);
          context.collectTypeDefinitions(ast, funcName, resolvedPath);
          context.collectAllExportedDefinitions(ast, resolvedPath);

          funcDefEntry = context.typeDefinitions[funcName];
          funcNode = getTypeDefinitionNode(funcDefEntry);
        }
      }
    }
  }

  return funcNode;
}

function readASTForUtilityContext(
  filePath: string,
  context: UtilityTypeResolverContext,
): t.File | null {
  if (context.symbolResolver) {
    const ast = context.symbolResolver.parseFile(filePath);
    if (ast) return ast;
  }
  try {
    const content = context.fileAccess.readFileSync(filePath, "utf-8");
    return parseTypeScriptFile(content);
  } catch {
    return null;
  }
}

function hasGenericTypeParameters(node: any): boolean {
  if (t.isTSTypeAliasDeclaration(node) || t.isTSInterfaceDeclaration(node)) {
    return !!node.typeParameters?.params?.length;
  }

  return false;
}

function findNamedTypeDeclarationInAst(ast: any, typeName: string): any | null {
  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : statement;

    if (
      (t.isTSTypeAliasDeclaration(declaration) || t.isTSInterfaceDeclaration(declaration)) &&
      t.isIdentifier(declaration.id, { name: typeName })
    ) {
      return declaration;
    }
  }

  return null;
}

function resolvePreferredGenericDefinition(
  typeName: string,
  context: UtilityTypeResolverContext,
): any | null {
  const existingEntry = context.typeDefinitions[typeName];
  const existingNode = getTypeDefinitionNode(existingEntry);
  if (existingNode && hasGenericTypeParameters(existingNode)) {
    return existingNode;
  }

  const candidateFiles = [context.currentFilePath];
  const normalizedPath = path.normalize(context.currentFilePath);
  const importedPath = context.importMap[normalizedPath]?.[typeName];
  if (importedPath) {
    const resolvedImportPath = context.resolveImportPath(importedPath, context.currentFilePath);
    if (resolvedImportPath) {
      candidateFiles.push(resolvedImportPath);
    }
  }

  for (const candidateFile of candidateFiles) {
    if (!candidateFile) {
      continue;
    }

    const ast = readASTForUtilityContext(candidateFile, context);
    if (!ast) continue;

    const declaration = findNamedTypeDeclarationInAst(ast, typeName);
    if (declaration && hasGenericTypeParameters(declaration)) {
      context.typeDefinitions[typeName] = {
        node: declaration,
        filePath: candidateFile,
      };
      return declaration;
    }
  }

  return existingNode;
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

  if (typeName === "Partial" || typeName === "Required") {
    if (node.typeParameters?.params.length > 0) {
      const resolved = context.resolveTSNodeType(node.typeParameters.params[0]);
      if (typeName === "Partial" && resolved) {
        // `Partial<T>` drops the `required` array.
        const { required: _required, ...rest } = resolved;
        return rest;
      }
      if (typeName === "Required" && resolved && resolved.properties) {
        return { ...resolved, required: Object.keys(resolved.properties) };
      }
      return resolved;
    }
    return { type: "object" };
  }

  if (typeName === "Readonly") {
    if (node.typeParameters?.params.length > 0) {
      const resolved = context.resolveTSNodeType(node.typeParameters.params[0]);
      // `Readonly<T>` — surface readOnly so serializers treat it as response-only.
      return resolved ? { ...resolved, readOnly: true } : { type: "object" };
    }
    return { type: "object" };
  }

  if (typeName === "Awaited") {
    if (node.typeParameters?.params.length > 0) {
      return context.resolveTSNodeType(node.typeParameters.params[0]);
    }
    return {};
  }

  if (typeName === "NonNullable") {
    if (node.typeParameters?.params.length > 0) {
      const resolved = context.resolveTSNodeType(node.typeParameters.params[0]);
      if (resolved) {
        const { nullable: _nullable, ...rest } = resolved;
        return rest;
      }
    }
    return {};
  }

  if (typeName === "Exclude" || typeName === "Extract") {
    if (node.typeParameters?.params.length >= 2) {
      const base = context.resolveTSNodeType(node.typeParameters.params[0]);
      const filterNode = node.typeParameters.params[1];
      const filterValues = new Set(context.extractKeysFromLiteralType(filterNode));
      if (base?.enum && filterValues.size > 0) {
        const stringValues = base.enum.filter(
          (value: unknown): value is string => typeof value === "string",
        );
        const filtered =
          typeName === "Exclude"
            ? stringValues.filter((value) => !filterValues.has(value))
            : stringValues.filter((value) => filterValues.has(value));
        return { ...base, enum: filtered };
      }
      return base ?? {};
    }
    return {};
  }

  if (typeName === "InstanceType") {
    if (node.typeParameters?.params.length > 0) {
      return context.resolveTSNodeType(node.typeParameters.params[0]);
    }
    return {};
  }

  if (
    typeName === "Uppercase" ||
    typeName === "Lowercase" ||
    typeName === "Capitalize" ||
    typeName === "Uncapitalize"
  ) {
    // String-casing utility types operate on string literal unions. When the
    // argument resolves to a concrete `enum` of strings we can apply the case
    // transformation statically; otherwise fall back to the underlying schema.
    if (node.typeParameters?.params.length > 0) {
      const inner = context.resolveTSNodeType(node.typeParameters.params[0]);
      const apply = (value: string): string => {
        switch (typeName) {
          case "Uppercase":
            return value.toUpperCase();
          case "Lowercase":
            return value.toLowerCase();
          case "Capitalize":
            return value.length > 0 ? (value[0] as string).toUpperCase() + value.slice(1) : value;
          case "Uncapitalize":
            return value.length > 0 ? (value[0] as string).toLowerCase() + value.slice(1) : value;
        }
        return value;
      };
      if (inner && inner.type === "string" && Array.isArray((inner as { enum?: unknown[] }).enum)) {
        const enumValues = (inner as { enum: unknown[] }).enum;
        const transformed = enumValues
          .filter((value): value is string => typeof value === "string")
          .map(apply);
        if (transformed.length === enumValues.length) {
          return { ...inner, enum: transformed };
        }
      }
      return inner;
    }
    return { type: "string" };
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
    const genericTypeDefinition = resolvePreferredGenericDefinition(typeName, context);

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
