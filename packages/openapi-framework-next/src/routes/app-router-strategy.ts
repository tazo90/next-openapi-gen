import * as t from "@babel/types";
import fs from "fs";
import type { NodePath } from "@babel/traverse";

import { HTTP_METHODS } from "@workspace/openapi-core/routes/router-strategy.js";
import { inferResponsesForExport } from "@workspace/openapi-core/routes/typescript-response-inference.js";
import { traverse } from "@workspace/openapi-core/shared/babel-traverse.js";
import type { RouterStrategy } from "@workspace/openapi-core/routes/router-strategy.js";
import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import type { DataTypes, OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

export class AppRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;
  private normalizedApiDir: string;

  constructor(config: OpenApiConfig) {
    this.config = config;
    this.normalizedApiDir = config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");
  }

  shouldProcessFile(fileName: string): boolean {
    return fileName === "route.ts" || fileName === "route.tsx";
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    traverse(ast, {
      ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
        const declaration = path.node.declaration;

        if (t.isFunctionDeclaration(declaration) && t.isIdentifier(declaration.id)) {
          if (HTTP_METHODS.includes(declaration.id.name)) {
            const dataTypes = this.inferHandlerDataTypes(
              extractJSDocComments(path, filePath),
              declaration,
              filePath,
              declaration.id.name,
            );
            addRoute(declaration.id.name, filePath, dataTypes);
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (HTTP_METHODS.includes(decl.id.name)) {
                const dataTypes = this.inferHandlerDataTypes(
                  extractJSDocComments(path, filePath),
                  decl,
                  filePath,
                  decl.id.name,
                );
                addRoute(decl.id.name, filePath, dataTypes);
              }
            }
          });
        }
      },
    });
  }

  getRoutePath(filePath: string): string {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const apiDirIndex = normalizedPath.indexOf(this.normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(`Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`);
    }

    let relativePath = normalizedPath.substring(apiDirIndex + this.normalizedApiDir.length);

    // Remove the /route.ts or /route.tsx suffix
    relativePath = relativePath.replace(/\/route\.tsx?$/, "");

    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }

    relativePath = relativePath.replace(/\/$/, "");

    // Remove Next.js route groups (folders in parentheses like (authenticated))
    relativePath = relativePath.replace(/\/\([^)]+\)/g, "");

    // Handle catch-all routes before dynamic routes
    relativePath = relativePath.replace(/\/\[\.\.\.(.*?)\]/g, "/{$1}");

    // Convert Next.js dynamic route syntax to OpenAPI parameter syntax
    relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");

    return relativePath || "/";
  }

  private inferHandlerDataTypes(
    dataTypes: DataTypes,
    handlerNode: t.Node,
    filePath: string,
    exportName: string,
  ): DataTypes {
    const inferredQueryParamNames = this.inferQueryParamsFromHandler(handlerNode);
    if (dataTypes.responseType) {
      return {
        ...dataTypes,
        ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
      };
    }

    const inferredResponseType = this.inferResponseTypeFromHandler(handlerNode);
    if (inferredResponseType && !this.requiresTypeScriptResponseInference(handlerNode)) {
      return {
        ...dataTypes,
        responseType: inferredResponseType,
        ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
      };
    }

    const checkerResponses = inferResponsesForExport(filePath, exportName);
    if (checkerResponses.responses.length > 0) {
      return {
        ...dataTypes,
        inferredResponses: checkerResponses.responses,
        ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
        diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
      };
    }

    if (!inferredResponseType) {
      return {
        ...dataTypes,
        diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
      };
    }

    return {
      ...dataTypes,
      responseType: inferredResponseType,
      ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
      diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
    };
  }

  private inferQueryParamsFromHandler(handlerNode: t.Node): string[] {
    const functionLike = this.getFunctionLikeNode(handlerNode);

    if (!functionLike || !functionLike.body) {
      return [];
    }

    const queryParamNames = new Set<string>();
    this.collectQueryParamNames(functionLike.body, queryParamNames);

    return Array.from(queryParamNames);
  }

  private collectQueryParamNames(
    node: t.Node | null | undefined,
    queryParamNames: Set<string>,
  ): void {
    if (!node) {
      return;
    }

    if (t.isCallExpression(node)) {
      const name = this.getSearchParamName(node);
      if (name) {
        queryParamNames.add(name);
      }
    }

    if (this.isNestedFunctionNode(node)) {
      return;
    }

    const visitorKeys = t.VISITOR_KEYS[node.type];
    if (!visitorKeys) {
      return;
    }

    visitorKeys.forEach((key) => {
      const value = node[key as keyof typeof node];
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (this.isTraversableNode(child)) {
            this.collectQueryParamNames(child, queryParamNames);
          }
        });
        return;
      }

      if (this.isTraversableNode(value)) {
        this.collectQueryParamNames(value, queryParamNames);
      }
    });
  }

  private getSearchParamName(node: t.CallExpression): string | null {
    if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
      return null;
    }

    const methodName = node.callee.property.name;
    if (methodName !== "get" && methodName !== "getAll" && methodName !== "has") {
      return null;
    }

    if (
      !t.isMemberExpression(node.callee.object) ||
      !t.isIdentifier(node.callee.object.property, { name: "searchParams" })
    ) {
      return null;
    }

    const firstArgument = node.arguments[0];
    return t.isStringLiteral(firstArgument) ? firstArgument.value : null;
  }

  private inferResponseTypeFromHandler(handlerNode: t.Node): string {
    const functionLike = this.getFunctionLikeNode(handlerNode);
    if (
      functionLike &&
      (t.isFunctionDeclaration(functionLike) || t.isFunctionExpression(functionLike))
    ) {
      return this.inferResponseTypeFromAnnotation(
        this.getReturnTypeAnnotation(functionLike.returnType),
      );
    }

    if (functionLike && t.isArrowFunctionExpression(functionLike)) {
      return this.inferResponseTypeFromAnnotation(
        this.getReturnTypeAnnotation(functionLike.returnType),
      );
    }

    return "";
  }

  private requiresTypeScriptResponseInference(handlerNode: t.Node): boolean {
    const functionLike = this.getFunctionLikeNode(handlerNode);
    if (!functionLike || !functionLike.body) {
      return false;
    }

    if (!t.isBlockStatement(functionLike.body)) {
      return this.requiresCheckerForExpression(functionLike.body);
    }

    let requiresChecker = false;
    this.visitReturnExpressions(functionLike.body, (expression) => {
      if (this.requiresCheckerForExpression(expression)) {
        requiresChecker = true;
      }
    });
    return requiresChecker;
  }

  private visitReturnExpressions(
    node: t.Node | null | undefined,
    visitor: (expression: t.Expression) => void,
  ): void {
    if (!node) {
      return;
    }

    if (t.isReturnStatement(node) && node.argument) {
      visitor(node.argument);
      return;
    }

    if (this.isNestedFunctionNode(node)) {
      return;
    }

    const visitorKeys = t.VISITOR_KEYS[node.type];
    if (!visitorKeys) {
      return;
    }

    visitorKeys.forEach((key) => {
      const value = node[key as keyof typeof node];
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (this.isTraversableNode(child)) {
            this.visitReturnExpressions(child, visitor);
          }
        });
        return;
      }

      if (this.isTraversableNode(value)) {
        this.visitReturnExpressions(value, visitor);
      }
    });
  }

  private requiresCheckerForExpression(expression: t.Expression): boolean {
    if (t.isCallExpression(expression) && t.isMemberExpression(expression.callee)) {
      const property = expression.callee.property;
      if (!t.isIdentifier(property)) {
        return false;
      }

      const object = expression.callee.object;
      if (!t.isIdentifier(object)) {
        return false;
      }

      const isResponseFactory = object.name === "Response" || object.name === "NextResponse";
      if (!isResponseFactory) {
        return false;
      }

      if (property.name === "redirect") {
        return true;
      }

      if (property.name === "json") {
        return Boolean(expression.arguments[1]);
      }
    }

    return t.isNewExpression(expression) && t.isIdentifier(expression.callee, { name: "Response" });
  }

  private getFunctionLikeNode(
    handlerNode: t.Node,
  ): t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | null {
    if (t.isFunctionDeclaration(handlerNode) || t.isFunctionExpression(handlerNode)) {
      return handlerNode;
    }

    if (t.isVariableDeclarator(handlerNode) && t.isArrowFunctionExpression(handlerNode.init)) {
      return handlerNode.init;
    }

    return null;
  }

  private isNestedFunctionNode(node: t.Node): boolean {
    return (
      t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isArrowFunctionExpression(node) ||
      t.isObjectMethod(node) ||
      t.isClassMethod(node)
    );
  }

  private isTraversableNode(value: unknown): value is t.Node {
    if (!value || typeof value !== "object" || !("type" in value)) {
      return false;
    }

    const { type } = value;
    return typeof type === "string" && type in t.VISITOR_KEYS;
  }

  private getReturnTypeAnnotation(
    returnType: t.Noop | t.TSTypeAnnotation | t.TypeAnnotation | null | undefined,
  ): t.TSType | null | undefined {
    if (returnType && t.isTSTypeAnnotation(returnType)) {
      return returnType.typeAnnotation;
    }

    return undefined;
  }

  private inferResponseTypeFromAnnotation(typeNode: t.TSType | null | undefined): string {
    if (!typeNode) {
      return "";
    }

    if (t.isTSTypeReference(typeNode)) {
      const typeName = this.getTypeReferenceName(typeNode.typeName);
      const typeParams = typeNode.typeParameters?.params ?? [];

      if (typeName === "Promise" && typeParams[0]) {
        return this.inferResponseTypeFromAnnotation(typeParams[0]);
      }

      if (typeName === "NextResponse" && typeParams[0]) {
        return this.stringifyTypeNode(typeParams[0]);
      }
    }

    return "";
  }

  private getTypeReferenceName(typeName: t.TSEntityName): string {
    if (t.isIdentifier(typeName)) {
      return typeName.name;
    }

    return typeName.right.name;
  }

  private stringifyTypeNode(typeNode: t.TSType): string {
    if (t.isTSTypeReference(typeNode)) {
      const typeName = this.getTypeReferenceName(typeNode.typeName);
      const typeParams = typeNode.typeParameters?.params ?? [];
      if (typeParams.length === 0) {
        return typeName;
      }

      return `${typeName}<${typeParams.map((param) => this.stringifyTypeNode(param)).join(", ")}>`;
    }

    if (t.isTSArrayType(typeNode)) {
      return `${this.stringifyTypeNode(typeNode.elementType)}[]`;
    }

    return "";
  }
}
