import fs from "fs";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

import { HTTP_METHODS } from "./router-strategy.js";
import type { RouterStrategy } from "./router-strategy.js";
import { traverse } from "../shared/babel-traverse.js";
import { parseJSDocBlock, parseTypeScriptFile } from "../shared/utils.js";
import type { DataTypes, OpenApiConfig } from "../shared/types.js";

export class PagesRouterStrategy implements RouterStrategy {
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
    return !fileName.startsWith("_") && (fileName.endsWith(".ts") || fileName.endsWith(".tsx"));
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    const methodComments: { method: string; dataTypes: DataTypes }[] = [];

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
                  dataTypes,
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
}
