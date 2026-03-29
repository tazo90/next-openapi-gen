import * as t from "@babel/types";
import fs from "fs";
import type { NodePath } from "@babel/traverse";

import {
  measurePerformance,
  type GenerationPerformanceProfile,
} from "@workspace/openapi-core/core/performance.js";
import { HTTP_METHODS } from "@workspace/openapi-core/routes/router-strategy.js";
import { inferResponsesForExports } from "@workspace/openapi-core/routes/typescript-response-inference.js";
import { traverse } from "@workspace/openapi-core/shared/babel-traverse.js";
import type { RouterStrategy } from "@workspace/openapi-core/routes/router-strategy.js";
import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import type {
  DataTypes,
  InferredResponseDefinition,
  OpenApiConfig,
  OpenApiSchemaLike,
} from "@workspace/openapi-core/shared/types.js";

export class AppRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;
  private normalizedApiDir: string;
  private readonly fileContentCache = new Map<string, string>();

  constructor(
    config: OpenApiConfig,
    private readonly performanceProfile?: GenerationPerformanceProfile,
  ) {
    this.config = config;
    this.normalizedApiDir = config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");
  }

  shouldProcessFile(fileName: string): boolean {
    return fileName === "route.ts" || fileName === "route.tsx";
  }

  precheckFile(filePath: string): boolean {
    const content = this.readFile(filePath);
    if (this.config.includeOpenApiRoutes && !content.includes("@openapi")) {
      return false;
    }

    return /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/.test(
      content,
    );
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const content = this.readFile(filePath);
    const ast = measurePerformance(this.performanceProfile, "parseRouteFilesMs", () =>
      parseTypeScriptFile(content),
    );
    const directRoutes: Array<{ method: string; dataTypes: DataTypes }> = [];
    const checkerCandidates: Array<{
      exportName: string;
      method: string;
      dataTypes: DataTypes;
      inferredQueryParamNames: string[];
      inferredResponseType: string;
    }> = [];

    measurePerformance(this.performanceProfile, "analyzeRouteFilesMs", () => {
      traverse(ast, {
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
          const declaration = path.node.declaration;

          if (t.isFunctionDeclaration(declaration) && t.isIdentifier(declaration.id)) {
            if (HTTP_METHODS.includes(declaration.id.name)) {
              const handlerResult = this.analyzeHandler(
                extractJSDocComments(path, filePath),
                declaration,
              );
              if (handlerResult.kind === "direct") {
                directRoutes.push({
                  method: declaration.id.name,
                  dataTypes: handlerResult.dataTypes,
                });
              } else {
                checkerCandidates.push({
                  exportName: declaration.id.name,
                  method: declaration.id.name,
                  dataTypes: handlerResult.dataTypes,
                  inferredQueryParamNames: handlerResult.inferredQueryParamNames,
                  inferredResponseType: handlerResult.inferredResponseType,
                });
              }
            }
          }

          if (t.isVariableDeclaration(declaration)) {
            declaration.declarations.forEach((decl) => {
              if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
                if (HTTP_METHODS.includes(decl.id.name)) {
                  const handlerResult = this.analyzeHandler(
                    extractJSDocComments(path, filePath),
                    decl,
                  );
                  if (handlerResult.kind === "direct") {
                    directRoutes.push({
                      method: decl.id.name,
                      dataTypes: handlerResult.dataTypes,
                    });
                  } else {
                    checkerCandidates.push({
                      exportName: decl.id.name,
                      method: decl.id.name,
                      dataTypes: handlerResult.dataTypes,
                      inferredQueryParamNames: handlerResult.inferredQueryParamNames,
                      inferredResponseType: handlerResult.inferredResponseType,
                    });
                  }
                }
              }
            });
          }
        },
      });
    });

    directRoutes.forEach(({ method, dataTypes }) => {
      addRoute(method, filePath, dataTypes);
    });

    if (checkerCandidates.length === 0) {
      return;
    }

    const checkerResponsesByExport = measurePerformance(
      this.performanceProfile,
      "typescriptResponseInferenceMs",
      () =>
        inferResponsesForExports(
          filePath,
          checkerCandidates.map((candidate) => candidate.exportName),
        ),
    );

    checkerCandidates.forEach(
      ({ exportName, method, dataTypes, inferredQueryParamNames, inferredResponseType }) => {
        const checkerResponses = checkerResponsesByExport.get(exportName) ?? {
          responses: [],
          diagnostics: [],
        };

        if (checkerResponses.responses.length > 0) {
          addRoute(method, filePath, {
            ...dataTypes,
            inferredResponses: checkerResponses.responses,
            ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
            diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
          });
          return;
        }

        if (!inferredResponseType) {
          addRoute(method, filePath, {
            ...dataTypes,
            ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
            diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
          });
          return;
        }

        addRoute(method, filePath, {
          ...dataTypes,
          responseType: inferredResponseType,
          ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
          diagnostics: [...(dataTypes.diagnostics || []), ...checkerResponses.diagnostics],
        });
      },
    );
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

  private analyzeHandler(
    dataTypes: DataTypes,
    handlerNode: t.Node,
  ):
    | { kind: "direct"; dataTypes: DataTypes }
    | {
        kind: "needs-checker";
        dataTypes: DataTypes;
        inferredQueryParamNames: string[];
        inferredResponseType: string;
      } {
    const handlerInsights = this.collectHandlerInsights(handlerNode);
    const { inferredQueryParamNames, inferredResponses, requiresTypeScriptChecker } =
      handlerInsights;
    if (dataTypes.responseType || dataTypes.responseItemType || dataTypes.successCode === "204") {
      return {
        kind: "direct",
        dataTypes: {
          ...dataTypes,
          ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
        },
      };
    }

    const inferredResponseType = this.inferResponseTypeFromHandler(handlerNode);
    if (inferredResponseType && !requiresTypeScriptChecker) {
      return {
        kind: "direct",
        dataTypes: {
          ...dataTypes,
          responseType: inferredResponseType,
          ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
        },
      };
    }

    if (!requiresTypeScriptChecker && !inferredResponseType) {
      return {
        kind: "direct",
        dataTypes: {
          ...dataTypes,
          ...(inferredResponses.length > 0 ? { inferredResponses } : {}),
          ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
        },
      };
    }

    return {
      kind: "needs-checker",
      dataTypes,
      inferredQueryParamNames,
      inferredResponseType,
    };
  }

  private collectHandlerInsights(handlerNode: t.Node): {
    inferredQueryParamNames: string[];
    inferredResponses: InferredResponseDefinition[];
    requiresTypeScriptChecker: boolean;
  } {
    const functionLike = this.getFunctionLikeNode(handlerNode);

    if (!functionLike || !functionLike.body) {
      return {
        inferredQueryParamNames: [],
        inferredResponses: [],
        requiresTypeScriptChecker: false,
      };
    }

    const queryParamNames = new Set<string>();
    const inferredResponses: InferredResponseDefinition[] = [];
    let requiresTypeScriptChecker = false;
    if (!t.isBlockStatement(functionLike.body)) {
      this.visitHandlerNode(functionLike.body, queryParamNames, (expression) => {
        const inferredResponse = this.inferResponseFromExpression(expression);
        if (inferredResponse) {
          inferredResponses.push(inferredResponse);
        }
        if (this.requiresCheckerForExpression(expression)) {
          requiresTypeScriptChecker = true;
        }
      });
      if (this.requiresCheckerForExpression(functionLike.body)) {
        requiresTypeScriptChecker = true;
      }

      return {
        inferredQueryParamNames: Array.from(queryParamNames),
        inferredResponses,
        requiresTypeScriptChecker,
      };
    }

    this.visitHandlerNode(functionLike.body, queryParamNames, (expression) => {
      const inferredResponse = this.inferResponseFromExpression(expression);
      if (inferredResponse) {
        inferredResponses.push(inferredResponse);
      }
      if (this.requiresCheckerForExpression(expression)) {
        requiresTypeScriptChecker = true;
      }
    });

    return {
      inferredQueryParamNames: Array.from(queryParamNames),
      inferredResponses,
      requiresTypeScriptChecker,
    };
  }

  private visitHandlerNode(
    node: t.Node | null | undefined,
    queryParamNames: Set<string>,
    onReturnExpression: (expression: t.Expression) => void,
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

    if (t.isReturnStatement(node) && node.argument) {
      onReturnExpression(node.argument);
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
            this.visitHandlerNode(child, queryParamNames, onReturnExpression);
          }
        });
        return;
      }

      if (this.isTraversableNode(value)) {
        this.visitHandlerNode(value, queryParamNames, onReturnExpression);
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

  private inferResponseFromExpression(
    expression: t.Expression,
  ): InferredResponseDefinition | undefined {
    if (!t.isCallExpression(expression) || !t.isMemberExpression(expression.callee)) {
      return undefined;
    }

    if (!t.isIdentifier(expression.callee.property, { name: "json" })) {
      return undefined;
    }

    const calleeObject = expression.callee.object;
    if (!t.isIdentifier(calleeObject)) {
      return undefined;
    }

    if (calleeObject.name !== "Response" && calleeObject.name !== "NextResponse") {
      return undefined;
    }

    const statusCode = this.getLiteralResponseStatusCode(expression.arguments[1]);
    const schema = this.inferSchemaFromJsonArgument(expression.arguments[0]);
    if (!schema && statusCode === "204") {
      return {
        statusCode,
        source: "typescript",
      };
    }

    if (!schema) {
      return undefined;
    }

    return {
      statusCode: statusCode || "200",
      schema,
      source: "typescript",
    };
  }

  private getLiteralResponseStatusCode(
    argument: t.CallExpression["arguments"][number] | undefined,
  ): string | undefined {
    if (!argument || !t.isObjectExpression(argument)) {
      return undefined;
    }

    for (const property of argument.properties) {
      if (!t.isObjectProperty(property) || !this.isPropertyNamed(property, "status")) {
        continue;
      }

      const value = property.value;
      if (t.isNumericLiteral(value)) {
        return String(value.value);
      }
    }

    return undefined;
  }

  private inferSchemaFromJsonArgument(
    argument: t.CallExpression["arguments"][number] | undefined,
  ): OpenApiSchemaLike | undefined {
    if (!argument) {
      return { type: "object" };
    }

    if (t.isSpreadElement(argument)) {
      return undefined;
    }

    if (t.isNullLiteral(argument)) {
      return { type: "null" };
    }

    if (t.isStringLiteral(argument) || t.isTemplateLiteral(argument)) {
      return { type: "string" };
    }

    if (t.isNumericLiteral(argument)) {
      return { type: "number" };
    }

    if (t.isBooleanLiteral(argument)) {
      return { type: "boolean" };
    }

    if (t.isArrayExpression(argument)) {
      const itemSchema = argument.elements
        .map((element) =>
          element && !t.isSpreadElement(element)
            ? this.inferSchemaFromJsonArgument(element)
            : undefined,
        )
        .find((schema): schema is OpenApiSchemaLike => Boolean(schema));
      return {
        type: "array",
        ...(itemSchema ? { items: itemSchema } : {}),
      };
    }

    if (t.isObjectExpression(argument)) {
      return { type: "object" };
    }

    if (
      t.isIdentifier(argument) ||
      t.isCallExpression(argument) ||
      t.isMemberExpression(argument) ||
      t.isAwaitExpression(argument)
    ) {
      return { type: "object" };
    }

    return undefined;
  }

  private isPropertyNamed(property: t.ObjectProperty, name: string): boolean {
    if (t.isIdentifier(property.key)) {
      return property.key.name === name;
    }

    return t.isStringLiteral(property.key) && property.key.value === name;
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

  private readFile(filePath: string): string {
    const cachedContent = this.fileContentCache.get(filePath);
    if (cachedContent) {
      return cachedContent;
    }

    const content = measurePerformance(this.performanceProfile, "readRouteFilesMs", () =>
      fs.readFileSync(filePath, "utf-8"),
    );
    this.fileContentCache.set(filePath, content);
    return content;
  }
}
