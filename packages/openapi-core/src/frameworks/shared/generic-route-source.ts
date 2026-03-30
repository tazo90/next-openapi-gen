import fs from "node:fs";
import path from "node:path";

import { measurePerformance, type GenerationPerformanceProfile } from "../../core/performance.js";
import { traverse } from "../../shared/babel-traverse.js";
import { extractJSDocComments, parseTypeScriptFile } from "../../shared/utils.js";
import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import type { FrameworkSource } from "../types.js";

const GENERIC_HTTP_EXPORTS = ["GET", "POST", "PUT", "PATCH", "DELETE", "loader", "action"] as const;

type GenericRouteSourceOptions = {
  routeGroups?: boolean | undefined;
  fileExtensions?: string[] | undefined;
};

export class GenericRouteSource implements FrameworkSource {
  private readonly fileContentCache = new Map<string, string>();

  constructor(
    public readonly config: ResolvedOpenApiConfig,
    private readonly options: GenericRouteSourceOptions = {},
    private readonly performanceProfile?: GenerationPerformanceProfile,
  ) {}

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

  public processFile(filePath: string, routePath = this.getRoutePath(filePath)) {
    const content = this.readFile(filePath);
    const ast = measurePerformance(this.performanceProfile, "parseRouteFilesMs", () =>
      parseTypeScriptFile(content),
    );
    const routes: ReturnType<FrameworkSource["processFile"]> = [];

    measurePerformance(this.performanceProfile, "analyzeRouteFilesMs", () => {
      traverse(ast, {
        ExportNamedDeclaration: (nodePath) => {
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
                dataTypes: extractJSDocComments(nodePath, filePath),
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
              dataTypes: extractJSDocComments(nodePath, filePath),
            });
          }
        },
      });
    });

    return routes;
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
