import fs from "fs";
import traverseModule from "@babel/traverse";

const traverse = (traverseModule as any).default || traverseModule;

import { RouterStrategy, HTTP_METHODS } from "./router-strategy.js";
import { parseTypeScriptFile, performAuthPresetReplacements } from "./utils.js";
import { DataTypes, OpenApiConfig } from "../types.js";

export class PagesRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;

  constructor(config: OpenApiConfig) {
    this.config = config;
  }

  shouldProcessFile(fileName: string): boolean {
    return (
      !fileName.startsWith("_") &&
      (fileName.endsWith(".ts") || fileName.endsWith(".tsx"))
    );
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void
  ): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    const methodComments: { method: string; dataTypes: DataTypes }[] = [];

    traverse(ast, {
      ExportDefaultDeclaration: (nodePath) => {
        const allComments = ast.comments || [];
        const exportStart = nodePath.node.start || 0;

        allComments.forEach((comment) => {
          if (
            comment.type === "CommentBlock" &&
            (comment.end || 0) < exportStart
          ) {
            const commentValue = comment.value;
            if (commentValue.includes("@method")) {
              const dataTypes = this.extractJSDocFromComment(commentValue);
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
  public extractJSDocFromComment(commentValue: string): DataTypes {
    const cleanedComment = commentValue.replace(/\*\s*/g, "").trim();

    let tag = "";
    let summary = "";
    let description = "";
    let paramsType = "";
    let pathParamsType = "";
    let bodyType = "";
    let auth = "";
    let isOpenApi = cleanedComment.includes("@openapi");
    let isIgnored = cleanedComment.includes("@ignore");
    let deprecated = cleanedComment.includes("@deprecated");
    let bodyDescription = "";
    let contentType = "";
    let responseType = "";
    let responseDescription = "";
    let responseSet = "";
    let addResponses = "";
    let successCode = "";
    let operationId = "";
    let method = "";

    const methodMatch = cleanedComment.match(/@method\s+(\S+)/);
    if (methodMatch) {
      method = methodMatch[1].trim().toUpperCase();
    }

    const firstLine = cleanedComment.split("\n")[0];
    if (!firstLine.trim().startsWith("@")) {
      summary = firstLine.trim();
    }

    const descMatch = cleanedComment.match(/@description\s+(.*)/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    const tagMatch = cleanedComment.match(/@tag\s+(.*)/);
    if (tagMatch) {
      tag = tagMatch[1].trim();
    }

    const paramsMatch =
      cleanedComment.match(/@queryParams\s+([\w<>,\s\[\]]+)/) ||
      cleanedComment.match(/@params\s+([\w<>,\s\[\]]+)/);
    if (paramsMatch) {
      paramsType = paramsMatch[1].trim();
    }

    const pathParamsMatch = cleanedComment.match(
      /@pathParams\s+([\w<>,\s\[\]]+)/
    );
    if (pathParamsMatch) {
      pathParamsType = pathParamsMatch[1].trim();
    }

    const bodyMatch = cleanedComment.match(/@body\s+([\w<>,\s\[\]]+)/);
    if (bodyMatch) {
      bodyType = bodyMatch[1].trim();
    }

    const bodyDescMatch = cleanedComment.match(/@bodyDescription\s+(.*)/);
    if (bodyDescMatch) {
      bodyDescription = bodyDescMatch[1].trim();
    }

    const contentTypeMatch = cleanedComment.match(/@contentType\s+(.*)/);
    if (contentTypeMatch) {
      contentType = contentTypeMatch[1].trim();
    }

    const responseMatch = cleanedComment.match(
      /@response\s+(?:(\d+):)?([^@\n\r]+)/
    );
    if (responseMatch) {
      const [, code, type] = responseMatch;
      const trimmedType = type?.trim();

      if (!code && trimmedType && /^\d{3}$/.test(trimmedType)) {
        successCode = trimmedType;
        responseType = undefined;
      } else {
        successCode = code || "";
        responseType = trimmedType;
      }
    }

    const respDescMatch = cleanedComment.match(/@responseDescription\s+(.*)/);
    if (respDescMatch) {
      responseDescription = respDescMatch[1].trim();
    }

    const respSetMatch = cleanedComment.match(/@responseSet\s+(.*)/);
    if (respSetMatch) {
      responseSet = respSetMatch[1].trim();
    }

    const addMatch = cleanedComment.match(/@add\s+(.*)/);
    if (addMatch) {
      addResponses = addMatch[1].trim();
    }

    const opIdMatch = cleanedComment.match(/@operationId\s+(\S+)/);
    if (opIdMatch) {
      operationId = opIdMatch[1].trim();
    }

    const authMatch = cleanedComment.match(/@auth\s+(.*)/);
    if (authMatch) {
      const authValue = authMatch[1].trim();
      switch (authValue) {
        case "bearer":
          auth = "BearerAuth";
          break;
        case "basic":
          auth = "BasicAuth";
          break;
        case "apikey":
          auth = "ApiKeyAuth";
          break;
        default:
          auth = performAuthPresetReplacements(authValue);
      }
    }

    return {
      tag,
      auth,
      summary,
      description,
      paramsType,
      pathParamsType,
      bodyType,
      isOpenApi,
      isIgnored,
      deprecated,
      bodyDescription,
      contentType,
      responseType,
      responseDescription,
      responseSet,
      addResponses,
      successCode,
      operationId,
      method,
    };
  }
}
