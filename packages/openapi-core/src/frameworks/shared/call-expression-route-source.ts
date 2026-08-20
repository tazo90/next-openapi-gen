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
import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import type { DiscoveredRoute, FrameworkSource } from "../types.js";
import { applyHandlerInsightsToDataTypes } from "./handler-insights.js";

const DEFAULT_METHOD_CALLEES = ["get", "post", "put", "patch", "delete"] as const;
const METHOD_BY_CALLEE: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};

export type CallExpressionRouteSourceOptions = {
  methodCallees?: readonly string[] | undefined;
  onCallee?: string | undefined;
  routeCallee?: string | undefined;
  useCallee?: string | undefined;
  basePathCallee?: string | undefined;
  fileExtensions?: string[] | undefined;
};

const moduleFileASTCache = new Map<string, t.File>();
const moduleFileContentCache = new Map<string, CachedFileContent>();

export class CallExpressionRouteSource implements FrameworkSource {
  private readonly fileASTCache: Map<string, t.File>;
  private readonly fileContentCache: Map<string, CachedFileContent>;
  private readonly entryFileName: string | undefined;

  constructor(
    public readonly config: ResolvedOpenApiConfig,
    private readonly options: CallExpressionRouteSourceOptions = {},
    private readonly performanceProfile?: GenerationPerformanceProfile,
    runtime?: SharedGenerationRuntime,
  ) {
    this.fileASTCache = runtime?.routeScan.fileASTCache ?? moduleFileASTCache;
    this.fileContentCache = runtime?.routeScan.fileContentCache ?? moduleFileContentCache;
    this.entryFileName = resolveEntryFileName(config.framework.modulePath);
  }

  public getScanRoots(): string[] {
    const modulePath = this.config.framework.modulePath;
    if (modulePath) {
      const resolved = path.resolve(modulePath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return [path.dirname(resolved)];
      }

      return [resolved];
    }

    return [this.config.apiDir];
  }

  public shouldProcessFile(fileName: string): boolean {
    if (this.entryFileName && fileName !== this.entryFileName) {
      return false;
    }

    const extensions = this.options.fileExtensions ?? [".ts", ".tsx", ".js", ".mjs"];
    return extensions.some((extension) => fileName.endsWith(extension));
  }

  public getRoutePath(filePath: string): string {
    const scanRoot = normalizePath(this.getScanRoots()[0] ?? this.config.apiDir);
    const normalizedPath = normalizePath(filePath);
    const rootIndex = normalizedPath.indexOf(scanRoot);
    if (rootIndex === -1) {
      return "/";
    }

    let relativePath = normalizedPath
      .substring(rootIndex + scanRoot.length)
      .replace(/\.(t|j)sx?$/, "")
      .replace(/\/index$/, "");
    if (!relativePath.startsWith("/")) {
      relativePath = `/${relativePath}`;
    }

    return relativePath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  }

  public precheckFile(filePath: string): boolean {
    const content = this.readFile(filePath);
    if (this.config.includeOpenApiRoutes && !content.includes("@openapi")) {
      return false;
    }

    return /\.(get|post|put|patch|delete|all|on|route|use|basePath)\s*\(/.test(content);
  }

  public processFile(filePath: string): DiscoveredRoute[] {
    return this.collectRoutes(filePath, [], new Set());
  }

  private collectRoutes(
    filePath: string,
    inheritedPrefixes: string[],
    visited: Set<string>,
  ): DiscoveredRoute[] {
    const resolvedPath = path.resolve(filePath);
    if (visited.has(resolvedPath) || !fs.existsSync(resolvedPath)) {
      return [];
    }
    visited.add(resolvedPath);

    const ast = this.parseFile(resolvedPath);
    const routes: DiscoveredRoute[] = [];
    const prefixesByRouter = new Map<string, string[]>();
    const imports = new Map<string, string>();

    measurePerformance(this.performanceProfile, "analyzeRouteFilesMs", () => {
      traverse(ast, {
        ImportDeclaration: (nodePath: NodePath<t.ImportDeclaration>) => {
          const resolvedImport = resolveImportedFile(resolvedPath, nodePath.node.source.value);
          if (!resolvedImport) {
            return;
          }

          for (const specifier of nodePath.node.specifiers) {
            if (
              t.isImportDefaultSpecifier(specifier) ||
              t.isImportSpecifier(specifier) ||
              t.isImportNamespaceSpecifier(specifier)
            ) {
              imports.set(specifier.local.name, resolvedImport);
            }
          }
        },
        VariableDeclarator: (nodePath: NodePath<t.VariableDeclarator>) => {
          if (!t.isIdentifier(nodePath.node.id)) {
            return;
          }

          const basePath = extractChainedBasePath(nodePath.node.init, this.getBasePathCallee());
          if (basePath) {
            prefixesByRouter.set(nodePath.node.id.name, [basePath]);
          }
        },
        CallExpression: (nodePath: NodePath<t.CallExpression>) => {
          const calleeName = getCalleeName(nodePath.node);
          if (!calleeName) {
            return;
          }

          const routerName = getCalleeObjectName(nodePath.node);
          if (calleeName === this.getBasePathCallee()) {
            const prefix = getStringArgument(nodePath.node, 0);
            if (routerName && prefix) {
              prefixesByRouter.set(routerName, [
                ...(prefixesByRouter.get(routerName) ?? []),
                prefix,
              ]);
            }
            return;
          }

          if (calleeName === this.getRouteCallee() || calleeName === this.getUseCallee()) {
            const prefix = getStringArgument(nodePath.node, 0);
            const mounted = getIdentifierArgument(nodePath.node, 1);
            if (!prefix || !mounted) {
              return;
            }

            const importedPath = imports.get(mounted);
            const mountPrefixes = [
              ...inheritedPrefixes,
              ...(routerName ? (prefixesByRouter.get(routerName) ?? []) : []),
              prefix,
            ];
            if (importedPath) {
              routes.push(...this.collectRoutes(importedPath, mountPrefixes, visited));
            }
            return;
          }

          const methods = this.getMethodsForCall(nodePath.node, calleeName);
          const routePathLiteral = this.getPathForCall(nodePath.node, calleeName);
          if (methods.length === 0 || !routePathLiteral) {
            return;
          }

          const handler = getHandlerArgument(nodePath.node);
          const prefixes = [
            ...inheritedPrefixes,
            ...(routerName ? (prefixesByRouter.get(routerName) ?? []) : []),
          ];
          const routePath = joinRoutePaths(...prefixes, routePathLiteral);
          const hasPathParams = extractPathParameters(routePath).length > 0;
          const commentPath = nodePath.getStatementParent() ?? nodePath;
          const dataTypes = applyHandlerInsightsToDataTypes(
            extractJSDocComments(commentPath, resolvedPath),
            handler ?? nodePath.node,
            { hasPathParams },
          );

          for (const method of methods) {
            routes.push({
              method,
              filePath: resolvedPath,
              routePath,
              dataTypes,
            });
          }
        },
      });
    });

    return routes;
  }

  private getMethodsForCall(node: t.CallExpression, calleeName: string): string[] {
    if (calleeName === this.getOnCallee()) {
      return getOnMethods(node);
    }

    const method = METHOD_BY_CALLEE[calleeName];
    if (method && this.getMethodCallees().includes(calleeName)) {
      return [method];
    }

    const chainedRoute = getChainedRouteCall(node);
    if (chainedRoute && METHOD_BY_CALLEE[calleeName]) {
      return [METHOD_BY_CALLEE[calleeName]];
    }

    return [];
  }

  private getPathForCall(node: t.CallExpression, calleeName: string): string | null {
    if (calleeName === this.getOnCallee()) {
      return getStringArgument(node, 1);
    }

    const chainedRoute = getChainedRouteCall(node);
    if (chainedRoute) {
      return getStringArgument(chainedRoute, 0);
    }

    return getStringArgument(node, 0);
  }

  private getMethodCallees(): readonly string[] {
    return this.options.methodCallees ?? DEFAULT_METHOD_CALLEES;
  }

  private getOnCallee(): string {
    return this.options.onCallee ?? "on";
  }

  private getRouteCallee(): string {
    return this.options.routeCallee ?? "route";
  }

  private getUseCallee(): string {
    return this.options.useCallee ?? "use";
  }

  private getBasePathCallee(): string {
    return this.options.basePathCallee ?? "basePath";
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

export function convertCallExpressionPath(routePath: string): string {
  let result = routePath.trim();
  if (!result.startsWith("/")) {
    result = `/${result}`;
  }

  result = result.replace(/\/:([A-Za-z0-9_]+)\?/g, "/{$1}");
  result = result.replace(/\/:([A-Za-z0-9_]+)/g, "/{$1}");
  result = result.replace(/\/+/g, "/").replace(/\/$/, "");
  return result || "/";
}

function joinRoutePaths(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/");
  return convertCallExpressionPath(`/${joined}`);
}

function getCalleeName(node: t.CallExpression): string | null {
  if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
    return node.callee.property.name;
  }

  return null;
}

function getCalleeObjectName(node: t.CallExpression): string | null {
  if (!t.isMemberExpression(node.callee)) {
    return null;
  }

  if (t.isIdentifier(node.callee.object)) {
    return node.callee.object.name;
  }

  if (t.isCallExpression(node.callee.object)) {
    return getCalleeObjectName(node.callee.object);
  }

  return null;
}

function getChainedRouteCall(node: t.CallExpression): t.CallExpression | null {
  let current: t.Node = node;

  while (t.isCallExpression(current) && t.isMemberExpression(current.callee)) {
    const calleeObject: t.Expression | t.Super | t.V8IntrinsicIdentifier = current.callee.object;
    if (
      t.isCallExpression(calleeObject) &&
      t.isMemberExpression(calleeObject.callee) &&
      t.isIdentifier(calleeObject.callee.property, { name: "route" })
    ) {
      return calleeObject;
    }

    current = calleeObject;
  }

  return null;
}

function getStringArgument(node: t.CallExpression, index: number): string | null {
  const argument = node.arguments[index];
  return argument && t.isStringLiteral(argument) ? argument.value : null;
}

function getIdentifierArgument(node: t.CallExpression, index: number): string | null {
  const argument = node.arguments[index];
  return argument && t.isIdentifier(argument) ? argument.name : null;
}

function getHandlerArgument(node: t.CallExpression): t.Node | null {
  for (let index = node.arguments.length - 1; index >= 0; index -= 1) {
    const argument = node.arguments[index];
    if (
      argument &&
      (t.isFunctionExpression(argument) ||
        t.isArrowFunctionExpression(argument) ||
        t.isIdentifier(argument))
    ) {
      return argument;
    }
  }

  return null;
}

function getOnMethods(node: t.CallExpression): string[] {
  const first = node.arguments[0];
  if (t.isStringLiteral(first)) {
    const method = first.value.toUpperCase();
    return METHOD_BY_CALLEE[method.toLowerCase()] ? [method] : [];
  }

  if (t.isArrayExpression(first)) {
    return first.elements.flatMap((element) =>
      element && t.isStringLiteral(element) && METHOD_BY_CALLEE[element.value.toLowerCase()]
        ? [element.value.toUpperCase()]
        : [],
    );
  }

  return [];
}

function extractChainedBasePath(
  node: t.Expression | null | undefined,
  callee: string,
): string | null {
  if (!node || !t.isCallExpression(node)) {
    return null;
  }

  if (getCalleeName(node) === callee) {
    return getStringArgument(node, 0);
  }

  return null;
}

function resolveImportedFile(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ??
    null
  );
}

function resolveEntryFileName(modulePath: string | undefined): string | undefined {
  if (!modulePath) {
    return undefined;
  }

  const resolved = path.resolve(modulePath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return path.basename(resolved);
  }

  return undefined;
}

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll("\\", "/");
}
