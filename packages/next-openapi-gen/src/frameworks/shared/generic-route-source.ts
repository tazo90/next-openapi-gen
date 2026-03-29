import fs from "node:fs";
import path from "node:path";

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
  constructor(
    public readonly config: ResolvedOpenApiConfig,
    private readonly options: GenericRouteSourceOptions = {},
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

  public processFile(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);
    const routes: ReturnType<FrameworkSource["processFile"]> = [];

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
              routePath: this.getRoutePath(filePath),
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
            routePath: this.getRoutePath(filePath),
            dataTypes: extractJSDocComments(nodePath, filePath),
          });
        }
      },
    });

    return routes;
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
