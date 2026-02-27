import { NodePath } from "@babel/traverse";
import { parse, ParserOptions } from "@babel/parser";
import * as t from "@babel/types";

import { DataTypes } from "../types.js";

export function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Extract path parameters from a route path
 * e.g. /users/{id}/posts/{postId} -> ['id', 'postId']
 */
export function extractPathParameters(routePath: string): string[] {
  const paramRegex = /{([^}]+)}/g;
  const params: string[] = [];
  let match;

  while ((match = paramRegex.exec(routePath)) !== null) {
    params.push(match[1]);
  }

  return params;
}

export function extractJSDocComments(path: NodePath): DataTypes {
  const comments = path.node.leadingComments;
  let tag = "";
  let summary = "";
  let description = "";
  let paramsType = "";
  let pathParamsType = "";
  let bodyType = "";
  let auth = "";
  let isOpenApi = false;
  let isIgnored = false;
  let deprecated = false;
  let bodyDescription = "";
  let contentType = "";
  let responseType = "";
  let responseDescription = "";
  let responseSet = "";
  let addResponses = "";
  let successCode = "";
  let operationId = "";
  let method = "";

  if (comments) {
    comments.forEach((comment) => {
      const commentValue = cleanComment(comment.value);

      isOpenApi = commentValue.includes("@openapi");

      if (commentValue.includes("@ignore")) {
        isIgnored = true;
      }

      if (commentValue.includes("@deprecated")) {
        deprecated = true;
      }

      if (commentValue.includes("@bodyDescription")) {
        const regex = /@bodyDescription\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          bodyDescription = match[1].trim();
        }
      }

      if (!summary) {
        const firstLine = commentValue.split("\n")[0];
        // Don't use tags as summary - only use actual descriptions
        if (!firstLine.trim().startsWith("@")) {
          summary = firstLine;
        }
      }

      if (commentValue.includes("@auth")) {
        const regex = /@auth\s*(.*)/;
        const value = commentValue.match(regex)[1].trim();

        switch (value) {
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
            auth = performAuthPresetReplacements(value);
        }
      }

      if (commentValue.includes("@description")) {
        const regex = /@description\s*(.*)/;
        description = commentValue.match(regex)[1].trim();
      }

      if (commentValue.includes("@tag")) {
        const regex = /@tag\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          tag = match[1].trim();
        }
      }

      if (commentValue.includes("@params") || commentValue.includes("@queryParams")) {
        paramsType = extractTypeFromComment(commentValue, "@queryParams") ||
                     extractTypeFromComment(commentValue, "@params");
      }

      if (commentValue.includes("@pathParams")) {
        pathParamsType = extractTypeFromComment(commentValue, "@pathParams");
      }

      if (commentValue.includes("@body")) {
        bodyType = extractTypeFromComment(commentValue, "@body");
      }

      if (commentValue.includes("@response")) {
        responseType = extractTypeFromComment(commentValue, "@response");
      }

      if (commentValue.includes("@contentType")) {
        const regex = /@contentType\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          contentType = match[1].trim();
        }
      }

      if (commentValue.includes("@responseDescription")) {
        const regex = /@responseDescription\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          responseDescription = match[1].trim();
        }
      }

      if (commentValue.includes("@responseSet")) {
        const regex = /@responseSet\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          responseSet = match[1].trim();
        }
      }

      if (commentValue.includes("@add")) {
        const regex = /@add\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          addResponses = match[1].trim();
        }
      }

      if (commentValue.includes("@operationId")) {
        const regex = /@operationId\s+(\S+)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          operationId = match[1].trim();
        }
      }

      if (commentValue.includes("@method")) {
        const regex = /@method\s+(\S+)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          method = match[1].trim().toUpperCase();
        }
      }

      if (commentValue.includes("@response")) {
        // Updated regex to support generic types
        const responseMatch = commentValue.match(
          /@response\s+(?:(\d+):)?([^@\n\r]+)(?:\s+(.*))?/
        );
        if (responseMatch) {
          const [, code, type] = responseMatch;
          const trimmedType = type?.trim();

          // Check if the type is just a status code (e.g., "@response 204")
          if (!code && trimmedType && /^\d{3}$/.test(trimmedType)) {
            // Type is actually a status code without a schema
            successCode = trimmedType;
            responseType = undefined;
          } else {
            successCode = code || "";
            responseType = trimmedType;
          }
        } else {
          responseType = extractTypeFromComment(commentValue, "@response");
        }
      }
    });
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

export function extractTypeFromComment(
  commentValue: string,
  tag: string
): string {
  // Updated regex to support generic types with angle brackets and array brackets
  // Use multiline mode (m flag) to match tag at start of line (after optional * from JSDoc)
  return (
    commentValue
      .match(new RegExp(`^\\s*\\*?\\s*${tag}\\s+([\\w<>,\\s\\[\\]]+)`, 'm'))?.[1]
      ?.trim() || ""
  );
}

export function cleanComment(commentValue: string): string {
  return commentValue.replace(/\*\s*/g, "").trim();
}

export function cleanSpec(spec: any) {
  const propsToRemove = [
    "apiDir",
    "routerType",
    "schemaDir",
    "docsUrl",
    "ui",
    "outputFile",
    "includeOpenApiRoutes",
    "ignoreRoutes",
    "schemaType",
    "defaultResponseSet",
    "responseSets",
    "errorConfig",
    "debug",
    "schemaFiles",
    "outputDir",
  ];
  const newSpec = { ...spec };

  propsToRemove.forEach((key) => delete newSpec[key]);

  // Process paths to ensure good examples for path parameters
  if (newSpec.paths) {
    Object.keys(newSpec.paths).forEach((path) => {
      // Check if path contains parameters
      if (path.includes("{") && path.includes("}")) {
        // For each HTTP method in this path
        Object.keys(newSpec.paths[path]).forEach((method) => {
          const operation = newSpec.paths[path][method];

          // Set example properties for each path parameter
          if (operation.parameters) {
            operation.parameters.forEach((param) => {
              if (param.in === "path" && !param.example) {
                // Generate an example based on parameter name
                if (param.name === "id" || param.name.endsWith("Id")) {
                  param.example = 123;
                } else if (param.name === "slug") {
                  param.example = "example-slug";
                } else {
                  param.example = "example";
                }
              }
            });
          }
        });
      }
    });
  }

  return newSpec;
}

const AUTH_PRESET_REPLACEMENTS: Record<string, string> = {
  bearer: "BearerAuth",
  basic: "BasicAuth",
  apikey: "ApiKeyAuth",
};

export function performAuthPresetReplacements(authValue: string): string {
  const authParts = authValue.split(",").map((part) => part.trim());
  const mappedParts = authParts.map(
    (part) => AUTH_PRESET_REPLACEMENTS[part.toLowerCase()] || part
  );

  return mappedParts.join(",");
}

export function getOperationId(routePath: string, method: string) {
  const operation = routePath.replaceAll(/\//g, "-").replace(/^-/, "");

  return `${method}-${operation}`;
}

/**
 * Common Babel parser configuration for TypeScript files with JSX support
 */
const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx", "decorators-legacy"],
};

/**
 * Parse TypeScript/TSX file content with the standard configuration
 * @param content - File content to parse
 * @param options - Optional parser options to override defaults
 * @returns Parsed AST
 */
export function parseTypeScriptFile(
  content: string,
  options?: Partial<ParserOptions>
): t.File {
  return parse(content, {
    ...DEFAULT_PARSER_OPTIONS,
    ...options,
  });
}
