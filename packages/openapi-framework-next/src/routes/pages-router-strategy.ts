import fs from "fs";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import {
  measurePerformance,
  type GenerationPerformanceProfile,
} from "@workspace/openapi-core/core/performance.js";
import { applyHandlerInsightsToDataTypes } from "@workspace/openapi-core/frameworks/shared/handler-insights.js";
import type { RouterStrategy } from "@workspace/openapi-core/routes/router-strategy.js";
import { HTTP_METHODS } from "@workspace/openapi-core/routes/router-strategy.js";
import { traverse } from "@workspace/openapi-core/shared/babel-traverse.js";
import { parseJSDocBlock } from "@workspace/openapi-core/shared/jsdoc.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";
import type { DataTypes, OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

type CachedFileContent = {
  content: string;
  mtimeMs: number;
  size: number;
};

const moduleFileASTCache = new Map<string, t.File>();
const moduleFileContentCache = new Map<string, CachedFileContent>();

export class PagesRouterStrategy implements RouterStrategy {
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
    return !fileName.startsWith("_") && (fileName.endsWith(".ts") || fileName.endsWith(".tsx"));
  }

  precheckFile(filePath: string): boolean {
    const content = this.readFile(filePath);
    if (!/export\s+default\b/.test(content)) {
      return false;
    }

    if (this.config.includeOpenApiRoutes && !content.includes("@openapi")) {
      return false;
    }

    return content.includes("@method");
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const ast = this.parseFile(filePath);

    const methodComments: { method: string; dataTypes: DataTypes }[] = [];
    const hasPathParams = this.hasPathParams(filePath);

    measurePerformance(this.performanceProfile, "analyzeRouteFilesMs", () => {
      traverse(ast, {
        ExportDefaultDeclaration: (nodePath: NodePath<t.ExportDefaultDeclaration>) => {
          const allComments = ast.comments || [];
          const exportStart = nodePath.node.start || 0;

          allComments.forEach((comment) => {
            if (comment.type === "CommentBlock" && (comment.end || 0) < exportStart) {
              const commentValue = comment.value;
              if (commentValue.includes("@method")) {
                const dataTypes = this.extractJSDocFromComment(commentValue, filePath);
                if (dataTypes.method && HTTP_METHODS.includes(dataTypes.method)) {
                  methodComments.push({
                    method: dataTypes.method,
                    dataTypes: applyHandlerInsightsToDataTypes(
                      dataTypes,
                      nodePath.node.declaration,
                      { hasPathParams },
                    ),
                  });
                }
              }
            }
          });

          methodComments.forEach(({ method, dataTypes }) => {
            addRoute(method, filePath, dataTypes);
          });
        },
      });
    });
  }

  getRoutePath(filePath: string): string {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const apiDirIndex = normalizedPath.indexOf(this.normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(`Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`);
    }

    let relativePath = normalizedPath.substring(apiDirIndex + this.normalizedApiDir.length);

    // Remove the file extension (.ts or .tsx)
    relativePath = relativePath.replace(/\.tsx?$/, "");

    // Remove /index suffix (pages/api/users/index.ts -> /users)
    relativePath = relativePath.replace(/\/index$/, "");

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

  /**
   * Extract JSDoc data from a raw comment string (Pages Router specific)
   */
  public extractJSDocFromComment(commentValue: string, filePath?: string): DataTypes {
    return parseJSDocBlock(commentValue, filePath);
  }

  private hasPathParams(filePath: string): boolean {
    try {
      return /\/\{[^}]+\}/.test(this.getRoutePath(filePath));
    } catch {
      return false;
    }
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
