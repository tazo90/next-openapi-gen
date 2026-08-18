import fs from "node:fs";
import path from "node:path";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { measurePerformance, type GenerationPerformanceProfile } from "../../core/performance.js";
import type { CachedFileContent, SharedGenerationRuntime } from "../../core/runtime.js";
import { traverse } from "../../shared/babel-traverse.js";
import { extractJSDocComments } from "../../shared/jsdoc.js";
import { parseTypeScriptFile } from "../../shared/parse-typescript.js";
import { extractPathParameters } from "../../shared/strings.js";
import type { DataTypes, ResolvedOpenApiConfig } from "../../shared/types.js";
import type { DiscoveredRoute, FrameworkSource } from "../types.js";
import { applyHandlerInsightsToDataTypes } from "./handler-insights.js";

const GENERIC_HTTP_EXPORTS = ["GET", "POST", "PUT", "PATCH", "DELETE", "loader", "action"] as const;
const FILENAME_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const FILENAME_METHOD_RE = /\.(get|post|put|patch|delete|head|options)$/i;

export type GenericRouteSourceOptions = {
  routeGroups?: boolean | undefined;
  fileExtensions?: string[] | undefined;
  fileNameFilter?: RegExp | undefined;
  stripSegments?: string[] | undefined;
  httpExports?: readonly string[] | undefined;
  ignoreExportNames?: readonly string[] | undefined;
  methodFromFilename?: boolean | undefined;
  expandActionMethods?: boolean | undefined;
};

const moduleFileASTCache = new Map<string, t.File>();
const moduleFileContentCache = new Map<string, CachedFileContent>();

export class GenericRouteSource implements FrameworkSource {
  private readonly fileASTCache: Map<string, t.File>;
  private readonly fileContentCache: Map<string, CachedFileContent>;

  constructor(
    public readonly config: ResolvedOpenApiConfig,
    private readonly options: GenericRouteSourceOptions = {},
    private readonly performanceProfile?: GenerationPerformanceProfile,
    runtime?: SharedGenerationRuntime,
  ) {
    this.fileASTCache = runtime?.routeScan.fileASTCache ?? moduleFileASTCache;
    this.fileContentCache = runtime?.routeScan.fileContentCache ?? moduleFileContentCache;
  }

  public getScanRoots(): string[] {
    return [this.config.apiDir];
  }

  public shouldProcessFile(fileName: string): boolean {
    const extensions = this.options.fileExtensions ?? [".ts", ".tsx"];
    if (!extensions.some((extension) => fileName.endsWith(extension))) {
      return false;
    }

    return this.options.fileNameFilter ? this.options.fileNameFilter.test(fileName) : true;
  }

  public getRoutePath(filePath: string): string {
    const normalizedApiDir = normalizePath(this.config.apiDir);
    const normalizedPath = normalizePath(filePath);
    const apiDirIndex = normalizedPath.indexOf(normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(`Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`);
    }

    let relativePath = normalizedPath.substring(apiDirIndex + normalizedApiDir.length);
    relativePath = relativePath.replace(/\.(t|j)sx?$/, "");
    if (this.options.methodFromFilename) {
      relativePath = relativePath.replace(FILENAME_METHOD_RE, "");
    }
    relativePath = relativePath.replace(/\/index$/, "");
    relativePath = relativePath.replace(/\/route$/, "");
    for (const segment of this.options.stripSegments ?? []) {
      const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      relativePath = relativePath.replace(new RegExp(`/${escaped}$`), "");
    }

    if (!relativePath.startsWith("/")) {
      relativePath = `/${relativePath}`;
    }

    if (this.options.routeGroups !== false) {
      relativePath = relativePath.replace(/\/\([^)]+\)/g, "");
    }

    relativePath = relativePath.replace(/\/\[\.\.\.(.*?)\]/g, "/{$1}");
    relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");
    relativePath = relativePath.replace(/\.\$([A-Za-z0-9_]+)/g, "/{$1}");
    relativePath = relativePath.replace(/\/\$([A-Za-z0-9_]+)/g, "/{$1}");
    relativePath = relativePath.replace(/\./g, "/");
    relativePath = relativePath.replace(/\/+/g, "/").replace(/\/$/, "");

    return relativePath || "/";
  }

  public precheckFile(filePath: string): boolean {
    const content = this.readFile(filePath);
    if (this.config.includeOpenApiRoutes && !content.includes("@openapi")) {
      return false;
    }

    if (this.options.methodFromFilename && /export\s+default\b/.test(content)) {
      return true;
    }

    const exportNames = this.getHttpExports().join("|");
    return new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+(${exportNames})\\b`,
    ).test(content);
  }

  public processFile(
    filePath: string,
    routePath: string = this.getRoutePath(filePath),
  ): DiscoveredRoute[] {
    const ast = this.parseFile(filePath);
    const routes: DiscoveredRoute[] = [];
    const hasPathParams = extractPathParameters(routePath).length > 0;
    const ignoredExports = new Set(this.options.ignoreExportNames ?? []);
    const filenameMethod = this.options.methodFromFilename ? getMethodFromFilename(filePath) : null;

    measurePerformance(this.performanceProfile, "analyzeRouteFilesMs", () => {
      traverse(ast, {
        ExportNamedDeclaration: (nodePath: NodePath<t.ExportNamedDeclaration>) => {
          const declaration = nodePath.node.declaration;
          if (!declaration) {
            return;
          }

          if ("declarations" in declaration && Array.isArray(declaration.declarations)) {
            for (const item of declaration.declarations) {
              if (item.type !== "VariableDeclarator" || item.id.type !== "Identifier") {
                continue;
              }

              this.pushExportRoutes(
                routes,
                filePath,
                routePath,
                item.id.name,
                nodePath,
                item,
                hasPathParams,
                ignoredExports,
              );
            }
            return;
          }

          if ("id" in declaration && declaration.id && declaration.id.type === "Identifier") {
            this.pushExportRoutes(
              routes,
              filePath,
              routePath,
              declaration.id.name,
              nodePath,
              declaration,
              hasPathParams,
              ignoredExports,
            );
          }
        },
        ExportDefaultDeclaration: (nodePath: NodePath<t.ExportDefaultDeclaration>) => {
          if (!this.options.methodFromFilename) {
            return;
          }

          const dataTypes = applyHandlerInsightsToDataTypes(
            extractJSDocComments(nodePath, filePath),
            nodePath.node.declaration,
            { hasPathParams },
          );
          const jsdocMethod = normalizeHttpMethod(dataTypes.method);
          const method = filenameMethod ?? jsdocMethod ?? "GET";
          routes.push({
            method,
            filePath,
            routePath,
            dataTypes:
              filenameMethod || jsdocMethod
                ? dataTypes
                : withUnspecifiedMethodDiagnostic(dataTypes),
          });
        },
      });
    });

    return routes;
  }

  private pushExportRoutes(
    routes: DiscoveredRoute[],
    filePath: string,
    routePath: string,
    exportName: string,
    nodePath: NodePath,
    handlerNode: t.Node,
    hasPathParams: boolean,
    ignoredExports: Set<string>,
  ): void {
    if (ignoredExports.has(exportName)) {
      return;
    }

    const exportMethod = this.normalizeExportMethod(exportName);
    if (!exportMethod) {
      return;
    }

    const dataTypes = applyHandlerInsightsToDataTypes(
      extractJSDocComments(nodePath, filePath),
      handlerNode,
      { hasPathParams },
    );
    const jsdocMethod = normalizeHttpMethod(dataTypes.method);
    const methods =
      exportName === "action" && this.options.expandActionMethods && !jsdocMethod
        ? detectRequestMethods(handlerNode)
        : [];

    const resolvedMethods = jsdocMethod
      ? [jsdocMethod]
      : methods.length > 0
        ? methods
        : [exportMethod];

    for (const method of resolvedMethods) {
      routes.push({
        method,
        filePath,
        routePath,
        dataTypes,
      });
    }
  }

  private getHttpExports(): readonly string[] {
    return this.options.httpExports ?? GENERIC_HTTP_EXPORTS;
  }

  private normalizeExportMethod(exportName: string): string | null {
    if (!this.getHttpExports().includes(exportName)) {
      return null;
    }

    if (exportName === "loader") {
      return "GET";
    }

    if (exportName === "action") {
      return "POST";
    }

    return exportName;
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

function getMethodFromFilename(filePath: string): string | null {
  const basename = path.basename(filePath).replace(/\.(t|j)sx?$/, "");
  const match = basename.match(FILENAME_METHOD_RE);
  return match?.[1] ? match[1].toUpperCase() : null;
}

function normalizeHttpMethod(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const method = value.toUpperCase();
  return FILENAME_HTTP_METHODS.includes(method as (typeof FILENAME_HTTP_METHODS)[number])
    ? method
    : null;
}

function withUnspecifiedMethodDiagnostic(dataTypes: DataTypes): DataTypes {
  return {
    ...dataTypes,
    diagnostics: [
      ...(dataTypes.diagnostics ?? []),
      {
        code: "unspecified-http-method",
        severity: "info",
        message:
          "Route file has no HTTP method suffix or @method tag; documenting as GET. Add a .get.ts suffix or @method.",
        metadata: {
          suggestedFix: "Rename the file to users.get.ts or add @method GET.",
        },
      },
    ],
  };
}

function detectRequestMethods(handlerNode: t.Node): string[] {
  const methods = new Set<string>();
  visitNode(handlerNode, (node) => {
    if (t.isSwitchStatement(node) && isRequestMethodExpression(node.discriminant)) {
      for (const clause of node.cases) {
        if (clause.test && t.isStringLiteral(clause.test)) {
          const method = normalizeHttpMethod(clause.test.value);
          if (method) {
            methods.add(method);
          }
        }
      }
    }

    if (t.isBinaryExpression(node) && (node.operator === "===" || node.operator === "==")) {
      if (isRequestMethodExpression(node.left) && t.isStringLiteral(node.right)) {
        const method = normalizeHttpMethod(node.right.value);
        if (method) {
          methods.add(method);
        }
      }
      if (isRequestMethodExpression(node.right) && t.isStringLiteral(node.left)) {
        const method = normalizeHttpMethod(node.left.value);
        if (method) {
          methods.add(method);
        }
      }
    }
  });

  return [...methods];
}

function isRequestMethodExpression(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.property, { name: "method" }) &&
    (t.isIdentifier(node.object, { name: "request" }) ||
      (t.isMemberExpression(node.object) &&
        t.isIdentifier(node.object.property, { name: "request" })))
  );
}

function visitNode(node: t.Node, visitor: (current: t.Node) => void): void {
  visitor(node);
  const visitorKeys = t.VISITOR_KEYS[node.type];
  if (!visitorKeys) {
    return;
  }

  for (const key of visitorKeys) {
    const value = node[key as keyof typeof node];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          visitNode(child as unknown as t.Node, visitor);
        }
      }
      continue;
    }

    if (value && typeof value === "object" && "type" in value) {
      visitNode(value as unknown as t.Node, visitor);
    }
  }
}

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll("\\", "/");
}
