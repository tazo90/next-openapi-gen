import fs from "fs";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import {
  measurePerformance,
  type GenerationPerformanceProfile,
} from "@workspace/openapi-core/core/performance.js";
import { collectHandlerInsights } from "@workspace/openapi-core/frameworks/shared/handler-insights.js";
import type { RouterStrategy } from "@workspace/openapi-core/routes/router-strategy.js";
import { HTTP_METHODS } from "@workspace/openapi-core/routes/router-strategy.js";
import { inferResponsesForExports } from "@workspace/openapi-core/routes/typescript-response-inference.js";
import { traverse } from "@workspace/openapi-core/shared/babel-traverse.js";
import type { DataTypes, OpenApiConfig } from "@workspace/openapi-core/shared/types.js";
import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

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
    const handlerInsights = collectHandlerInsights(handlerNode, {
      hasPathParams: Boolean(dataTypes.pathParamsType?.trim()),
    });
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
