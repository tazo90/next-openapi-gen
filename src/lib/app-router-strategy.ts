import * as t from "@babel/types";
import fs from "fs";
import traverseModule from "@babel/traverse";

const traverse = (traverseModule as any).default || traverseModule;

import { RouterStrategy, HTTP_METHODS } from "./router-strategy.js";
import { extractJSDocComments, parseTypeScriptFile } from "./utils.js";
import { DataTypes, OpenApiConfig } from "../types.js";

export class AppRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;

  constructor(config: OpenApiConfig) {
    this.config = config;
  }

  shouldProcessFile(fileName: string): boolean {
    return fileName === "route.ts" || fileName === "route.tsx";
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void
  ): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        const declaration = path.node.declaration;

        if (
          t.isFunctionDeclaration(declaration) &&
          t.isIdentifier(declaration.id)
        ) {
          if (HTTP_METHODS.includes(declaration.id.name)) {
            const dataTypes = extractJSDocComments(path);
            addRoute(declaration.id.name, filePath, dataTypes);
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (HTTP_METHODS.includes(decl.id.name)) {
                const dataTypes = extractJSDocComments(path);
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

    const normalizedApiDir = this.config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    const apiDirIndex = normalizedPath.indexOf(normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(
        `Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`
      );
    }

    let relativePath = normalizedPath.substring(
      apiDirIndex + normalizedApiDir.length
    );

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
}
