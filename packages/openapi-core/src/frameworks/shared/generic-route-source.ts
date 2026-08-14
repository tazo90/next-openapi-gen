import fs from "node:fs";
import path from "node:path";

import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

import { measurePerformance, type GenerationPerformanceProfile } from "../../core/performance.js";
import type { CachedFileContent, SharedGenerationRuntime } from "../../core/runtime.js";
import { traverse } from "../../shared/babel-traverse.js";
import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import {
  extractJSDocComments,
  extractPathParameters,
  parseTypeScriptFile,
} from "../../shared/utils.js";
import type { DiscoveredRoute, FrameworkSource } from "../types.js";
import { applyHandlerInsightsToDataTypes } from "./handler-insights.js";

const GENERIC_HTTP_EXPORTS = ["GET", "POST", "PUT", "PATCH", "DELETE", "loader", "action"] as const;

type GenericRouteSourceOptions = {
  routeGroups?: boolean | undefined;
  fileExtensions?: string[] | undefined;
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
    return extensions.some((extension) => fileName.endsWith(extension));
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
    relativePath = relativePath.replace(/\/index$/, "");
    relativePath = relativePath.replace(/\/route$/, "");

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

    return /export\s+(?:async\s+)?(?:function|const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|loader|action)\b/.test(
      content,
    );
  }

  public processFile(
    filePath: string,
    routePath: string = this.getRoutePath(filePath),
  ): DiscoveredRoute[] {
    const ast = this.parseFile(filePath);
    const routes: DiscoveredRoute[] = [];
    const hasPathParams = extractPathParameters(routePath).length > 0;

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

              const exportName = item.id.name;
              const method = normalizeExportMethod(exportName);
              if (!method) {
                continue;
              }

              routes.push({
                method,
                filePath,
                routePath,
                dataTypes: applyHandlerInsightsToDataTypes(
                  extractJSDocComments(nodePath, filePath),
                  item,
                  { hasPathParams },
                ),
              });
            }
            return;
          }

          if ("id" in declaration && declaration.id && declaration.id.type === "Identifier") {
            const method = normalizeExportMethod(declaration.id.name);
            if (!method) {
              return;
            }

            routes.push({
              method,
              filePath,
              routePath,
              dataTypes: applyHandlerInsightsToDataTypes(
                extractJSDocComments(nodePath, filePath),
                declaration,
                { hasPathParams },
              ),
            });
          }
        },
      });
    });

    return routes;
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

function normalizeExportMethod(exportName: string): string | null {
  if (!GENERIC_HTTP_EXPORTS.includes(exportName as (typeof GENERIC_HTTP_EXPORTS)[number])) {
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

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll("\\", "/");
}
