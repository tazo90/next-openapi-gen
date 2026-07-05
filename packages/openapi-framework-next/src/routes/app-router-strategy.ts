import fs from "fs";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import {
  measurePerformance,
  type GenerationPerformanceProfile,
} from "@workspace/openapi-core/core/performance.js";
import type { RouterStrategy } from "@workspace/openapi-core/routes/router-strategy.js";
import { HTTP_METHODS } from "@workspace/openapi-core/routes/router-strategy.js";
import { inferResponsesForExports } from "@workspace/openapi-core/routes/typescript-response-inference.js";
import { traverse } from "@workspace/openapi-core/shared/babel-traverse.js";
import type {
  DataTypes,
  InferredResponseDefinition,
  OpenApiConfig,
  OpenApiSchemaLike,
} from "@workspace/openapi-core/shared/types.js";
import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

type HandlerValueSource = "pathParamsType" | "queryParamsType" | "bodyType";
type HandlerParsedSchemas = Partial<Record<HandlerValueSource, string>> & {
  notFoundResponse?: boolean;
  streamResponse?: boolean;
};

type CachedFileContent = {
  content: string;
  mtimeMs: number;
  size: number;
};

const moduleFileASTCache = new Map<string, t.File>();
const moduleFileContentCache = new Map<string, CachedFileContent>();

export class AppRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;
  private normalizedApiDir: string;
  private readonly fileASTCache: Map<string, t.File>;
  private readonly fileContentCache: Map<string, CachedFileContent>;

  constructor(
    config: OpenApiConfig,
    private readonly performanceProfile?: GenerationPerformanceProfile,
  ) {
    this.config = config;
    this.fileASTCache = moduleFileASTCache;
    this.fileContentCache = moduleFileContentCache;
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

    return /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b(?:\s*:\s*(?:=>|[^=;])+)?\s*=(?!=|>)/.test(
      content,
    );
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const ast = this.parseFile(filePath);
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

    // Strip parallel route segments (@folder)
    relativePath = relativePath.replace(/\/@[^/]+/g, "");

    // Strip intercepting route segments like (.)segment, (..)segment, (...segment)
    relativePath = relativePath.replace(/\/\(\.+[^)]*\)/g, "");

    // Optional catch-all routes [[...slug]] before required catch-all
    relativePath = relativePath.replace(/\/\[\[\.\.\.(.*?)\]\]/g, "/{$1}");

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
    const {
      inferredBodyType,
      inferredPathParamsType,
      inferredQueryParamNames,
      inferredQueryParamsType,
      inferredResponses,
      handlerDiagnostics,
      requiresTypeScriptChecker,
    } = handlerInsights;
    const inferredDataTypes: DataTypes = {
      ...dataTypes,
      ...(inferredBodyType && !dataTypes.bodyType ? { inferredBodyType } : {}),
      ...(inferredPathParamsType && !dataTypes.pathParamsType ? { inferredPathParamsType } : {}),
      ...(inferredQueryParamsType && !dataTypes.paramsType ? { inferredQueryParamsType } : {}),
      ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
      ...(handlerDiagnostics.length > 0
        ? { diagnostics: [...(dataTypes.diagnostics ?? []), ...handlerDiagnostics] }
        : {}),
    };
    if (dataTypes.responseType || dataTypes.responseItemType || dataTypes.successCode === "204") {
      return {
        kind: "direct",
        dataTypes: inferredDataTypes,
      };
    }

    const inferredResponseType = this.inferResponseTypeFromHandler(handlerNode);
    if (inferredResponseType && !requiresTypeScriptChecker) {
      return {
        kind: "direct",
        dataTypes: {
          ...inferredDataTypes,
          responseType: inferredResponseType,
        },
      };
    }

    if (!requiresTypeScriptChecker && !inferredResponseType) {
      return {
        kind: "direct",
        dataTypes: {
          ...inferredDataTypes,
          ...(inferredResponses.length > 0 ? { inferredResponses } : {}),
        },
      };
    }

    return {
      kind: "needs-checker",
      dataTypes: inferredDataTypes,
      inferredQueryParamNames,
      inferredResponseType,
    };
  }

  private collectHandlerInsights(handlerNode: t.Node): {
    inferredBodyType: string;
    inferredPathParamsType: string;
    inferredQueryParamNames: string[];
    inferredQueryParamsType: string;
    inferredResponses: InferredResponseDefinition[];
    handlerDiagnostics: NonNullable<DataTypes["diagnostics"]>;
    requiresTypeScriptChecker: boolean;
  } {
    const functionLike = this.getFunctionLikeNode(handlerNode);

    if (!functionLike || !functionLike.body) {
      return {
        inferredBodyType: "",
        inferredPathParamsType: "",
        inferredQueryParamNames: [],
        inferredQueryParamsType: "",
        inferredResponses: [],
        handlerDiagnostics: [],
        requiresTypeScriptChecker: false,
      };
    }

    const queryParamNames = new Set<string>();
    const parsedSchemas: HandlerParsedSchemas = {};
    const inferredResponses: InferredResponseDefinition[] = [];
    let requiresTypeScriptChecker = false;
    if (!t.isBlockStatement(functionLike.body)) {
      const aliases = new Map<string, HandlerValueSource>();
      this.seedParameterAliases(functionLike, aliases);
      this.visitHandlerNode(
        functionLike.body,
        queryParamNames,
        aliases,
        parsedSchemas,
        (expression) => {
          const inferredResponse = this.inferResponseFromExpression(expression);
          if (inferredResponse) {
            inferredResponses.push(inferredResponse);
          }
          if (this.requiresCheckerForExpression(expression)) {
            requiresTypeScriptChecker = true;
          }
        },
      );
      if (this.requiresCheckerForExpression(functionLike.body)) {
        requiresTypeScriptChecker = true;
      }

      if (
        parsedSchemas.notFoundResponse &&
        !inferredResponses.some((response) => response.statusCode === "404")
      ) {
        inferredResponses.push({
          statusCode: "404",
          description: "Not Found",
          source: "typescript",
        });
      }

      if (
        parsedSchemas.streamResponse &&
        !inferredResponses.some((response) => response.contentType)
      ) {
        inferredResponses.push({
          statusCode: "200",
          contentType: "text/event-stream",
          schema: { type: "string" },
          description: "Streaming response",
          source: "typescript",
        });
      }

      return {
        inferredBodyType: parsedSchemas.bodyType ?? "",
        inferredPathParamsType: parsedSchemas.pathParamsType ?? "",
        inferredQueryParamNames: Array.from(queryParamNames),
        inferredQueryParamsType: parsedSchemas.queryParamsType ?? "",
        inferredResponses,
        handlerDiagnostics: this.buildHandlerDiagnostics(parsedSchemas),
        requiresTypeScriptChecker,
      };
    }

    const aliases = new Map<string, HandlerValueSource>();
    this.seedParameterAliases(functionLike, aliases);
    this.visitHandlerNode(
      functionLike.body,
      queryParamNames,
      aliases,
      parsedSchemas,
      (expression) => {
        const inferredResponse = this.inferResponseFromExpression(expression);
        if (inferredResponse) {
          inferredResponses.push(inferredResponse);
        }
        if (this.requiresCheckerForExpression(expression)) {
          requiresTypeScriptChecker = true;
        }
      },
    );

    if (
      parsedSchemas.notFoundResponse &&
      !inferredResponses.some((response) => response.statusCode === "404")
    ) {
      inferredResponses.push({
        statusCode: "404",
        description: "Not Found",
        source: "typescript",
      });
    }

    if (
      parsedSchemas.streamResponse &&
      !inferredResponses.some((response) => response.contentType)
    ) {
      inferredResponses.push({
        statusCode: "200",
        contentType: "text/event-stream",
        schema: { type: "string" },
        description: "Streaming response",
        source: "typescript",
      });
    }

    return {
      inferredBodyType: parsedSchemas.bodyType ?? "",
      inferredPathParamsType: parsedSchemas.pathParamsType ?? "",
      inferredQueryParamNames: Array.from(queryParamNames),
      inferredQueryParamsType: parsedSchemas.queryParamsType ?? "",
      inferredResponses,
      handlerDiagnostics: this.buildHandlerDiagnostics(parsedSchemas),
      requiresTypeScriptChecker,
    };
  }

  private buildHandlerDiagnostics(
    parsedSchemas: HandlerParsedSchemas,
  ): NonNullable<DataTypes["diagnostics"]> {
    const diagnostics: NonNullable<DataTypes["diagnostics"]> = [];

    if (parsedSchemas.notFoundResponse) {
      diagnostics.push({
        code: "unsupported-route-feature",
        severity: "info",
        message:
          "Handler calls notFound(); add an explicit @response for 404 if you want it documented in OpenAPI.",
      });
    }

    if (parsedSchemas.streamResponse) {
      diagnostics.push({
        code: "stream-response-hint",
        severity: "info",
        message:
          "Handler appears to return a streaming body. Consider @responseContentType text/event-stream (or another sequential media type) with @responseItem for accurate OpenAPI output.",
      });
    }

    return diagnostics;
  }

  private isNotFoundCall(node: t.CallExpression): boolean {
    return (
      t.isIdentifier(node.callee, { name: "notFound" }) ||
      (t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property, { name: "notFound" }) &&
        t.isIdentifier(node.callee.object, { name: "next" }))
    );
  }

  private isReadableStreamResponse(node: t.CallExpression): boolean {
    if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
      return false;
    }

    if (node.callee.property.name !== "json") {
      return false;
    }

    const firstArgument = node.arguments[0];
    if (!firstArgument) {
      return false;
    }

    return this.containsReadableStream(firstArgument);
  }

  private containsReadableStream(node: t.Node): boolean {
    if (t.isNewExpression(node) && t.isIdentifier(node.callee, { name: "ReadableStream" })) {
      return true;
    }

    const visitorKeys = t.VISITOR_KEYS[node.type];
    if (!visitorKeys) {
      return false;
    }

    return visitorKeys.some((key) => {
      const value = node[key as keyof typeof node];
      if (Array.isArray(value)) {
        return value.some(
          (child) => this.isTraversableNode(child) && this.containsReadableStream(child),
        );
      }

      return this.isTraversableNode(value) && this.containsReadableStream(value);
    });
  }

  private visitHandlerNode(
    node: t.Node | null | undefined,
    queryParamNames: Set<string>,
    aliases: Map<string, HandlerValueSource>,
    parsedSchemas: HandlerParsedSchemas,
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

      const parsedSchema = this.getParsedSchemaFromCall(node, aliases);
      if (parsedSchema) {
        parsedSchemas[parsedSchema.source] ??= parsedSchema.schemaName;
      }

      if (this.isNotFoundCall(node)) {
        parsedSchemas.notFoundResponse = true;
      }

      if (this.isReadableStreamResponse(node)) {
        parsedSchemas.streamResponse = true;
      }
    }

    if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && node.init) {
      const source = this.getHandlerValueSource(node.init, aliases);
      if (source) {
        aliases.set(node.id.name, source);
      }
    }

    if (t.isReturnStatement(node) && node.argument) {
      if (t.isCallExpression(node.argument) && this.isReadableStreamResponse(node.argument)) {
        parsedSchemas.streamResponse = true;
      }
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
            this.visitHandlerNode(
              child,
              queryParamNames,
              aliases,
              parsedSchemas,
              onReturnExpression,
            );
          }
        });
        return;
      }

      if (this.isTraversableNode(value)) {
        this.visitHandlerNode(value, queryParamNames, aliases, parsedSchemas, onReturnExpression);
      }
    });
  }

  private seedParameterAliases(
    functionLike: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
    aliases: Map<string, HandlerValueSource>,
  ): void {
    for (const param of functionLike.params) {
      if (!t.isObjectPattern(param)) {
        continue;
      }

      for (const property of param.properties) {
        if (!t.isObjectProperty(property)) {
          continue;
        }

        const keyName = this.getObjectKeyName(property.key);
        if (keyName !== "params" || !t.isIdentifier(property.value)) {
          continue;
        }

        aliases.set(property.value.name, "pathParamsType");
      }
    }
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

  private getParsedSchemaFromCall(
    node: t.CallExpression,
    aliases: Map<string, HandlerValueSource>,
  ): { schemaName: string; source: HandlerValueSource } | null {
    if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
      return null;
    }

    const methodName = node.callee.property.name;
    if (methodName !== "parse" && methodName !== "safeParse") {
      return null;
    }

    if (!t.isIdentifier(node.callee.object)) {
      return null;
    }

    const firstArgument = node.arguments[0];
    if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
      return null;
    }

    const source = this.getHandlerValueSource(firstArgument, aliases);
    return source ? { schemaName: node.callee.object.name, source } : null;
  }

  private getHandlerValueSource(
    node: t.Node,
    aliases: Map<string, HandlerValueSource>,
  ): HandlerValueSource | null {
    if (t.isIdentifier(node)) {
      return aliases.get(node.name) ?? null;
    }

    if (t.isAwaitExpression(node)) {
      return this.getHandlerValueSource(node.argument, aliases);
    }

    if (this.isContextParamsExpression(node)) {
      return "pathParamsType";
    }

    if (this.isJsonBodyExpression(node) || this.isFormDataExpression(node)) {
      return "bodyType";
    }

    if (this.containsSearchParams(node)) {
      return "queryParamsType";
    }

    return null;
  }

  private isContextParamsExpression(node: t.Node): boolean {
    return (
      t.isMemberExpression(node) &&
      t.isIdentifier(node.property, { name: "params" }) &&
      t.isIdentifier(node.object)
    );
  }

  private isJsonBodyExpression(node: t.Node): boolean {
    return this.isRequestMethodCall(node, "json");
  }

  private isFormDataExpression(node: t.Node): boolean {
    return this.isRequestMethodCall(node, "formData");
  }

  private isRequestMethodCall(node: t.Node, methodName: string): boolean {
    return (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: methodName }) &&
      t.isIdentifier(node.callee.object)
    );
  }

  private containsSearchParams(node: t.Node): boolean {
    if (t.isMemberExpression(node) && t.isIdentifier(node.property, { name: "searchParams" })) {
      return true;
    }

    const visitorKeys = t.VISITOR_KEYS[node.type];
    if (!visitorKeys) {
      return false;
    }

    return visitorKeys.some((key) => {
      const value = node[key as keyof typeof node];
      if (Array.isArray(value)) {
        return value.some(
          (child) => this.isTraversableNode(child) && this.containsSearchParams(child),
        );
      }

      return this.isTraversableNode(value) && this.containsSearchParams(value);
    });
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

      if (property.name === "json") {
        return Boolean(expression.arguments[1]);
      }
    }

    return false;
  }

  private inferResponseFromExpression(
    expression: t.Expression,
  ): InferredResponseDefinition | undefined {
    if (this.isRedirectResponse(expression)) {
      return {
        statusCode: "307",
        description: "Redirect response",
        source: "typescript",
      };
    }

    if (t.isNewExpression(expression) && t.isIdentifier(expression.callee, { name: "Response" })) {
      const statusCode = this.getLiteralResponseStatusCode(expression.arguments[1]);
      if (statusCode === "204") {
        return { statusCode, source: "typescript" };
      }
    }

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

  private isRedirectResponse(expression: t.Expression): boolean {
    if (!t.isCallExpression(expression) || !t.isMemberExpression(expression.callee)) {
      return false;
    }

    return (
      t.isIdentifier(expression.callee.property, { name: "redirect" }) &&
      t.isIdentifier(expression.callee.object) &&
      (expression.callee.object.name === "Response" ||
        expression.callee.object.name === "NextResponse")
    );
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
    return this.getObjectKeyName(property.key) === name;
  }

  private getObjectKeyName(key: t.Node): string | null {
    if (t.isIdentifier(key)) {
      return key.name;
    }

    if (t.isStringLiteral(key)) {
      return key.value;
    }

    return null;
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
    const stat = fs.statSync(filePath);
    const cachedContent = this.fileContentCache.get(filePath);
    if (
      cachedContent &&
      cachedContent.mtimeMs === stat.mtimeMs &&
      cachedContent.size === stat.size
    ) {
      return cachedContent.content;
    }

    const content = measurePerformance(this.performanceProfile, "readRouteFilesMs", () =>
      fs.readFileSync(filePath, "utf-8"),
    );
    this.fileContentCache.set(filePath, {
      content,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
    this.fileASTCache.delete(filePath);
    return content;
  }

  private parseFile(filePath: string): t.File {
    const content = this.readFile(filePath);
    const cachedAst = this.fileASTCache.get(filePath);
    if (cachedAst) {
      return cachedAst;
    }

    const ast = measurePerformance(this.performanceProfile, "parseRouteFilesMs", () =>
      parseTypeScriptFile(content),
    );
    this.fileASTCache.set(filePath, ast);
    return ast;
  }
}
