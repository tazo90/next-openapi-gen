import { NodePath } from "@babel/traverse";

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
  let responseType = "";
  let auth = "";
  let isOpenApi = false;
  let deprecated = false;
  let bodyDescription = "";
  let responseDescription = "";

  if (comments) {
    comments.forEach((comment) => {
      const commentValue = cleanComment(comment.value);

      isOpenApi = commentValue.includes("@openapi");

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

      if (commentValue.includes("@responseDescription")) {
        const regex = /@responseDescription\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          responseDescription = match[1].trim();
        }
      }

      if (!summary) {
        summary = commentValue.split("\n")[0];
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
        }
      }

      if (commentValue.includes("@desc")) {
        const regex = /@desc\s*(.*)/;
        description = commentValue.match(regex)[1].trim();
      }

      if (commentValue.includes("@tag")) {
        const regex = /@tag\s*(.*)/;
        const match = commentValue.match(regex);
        if (match && match[1]) {
          tag = match[1].trim();
        }
      }

      if (commentValue.includes("@params")) {
        paramsType = extractTypeFromComment(commentValue, "@params");
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
    responseType,
    isOpenApi,
    deprecated,
    bodyDescription,
    responseDescription,
  };
}

export function extractTypeFromComment(
  commentValue: string,
  tag: string
): string {
  return commentValue.match(new RegExp(`${tag}\\s*\\s*(\\w+)`))?.[1] || "";
}

export function cleanComment(commentValue: string): string {
  return commentValue.replace(/\*\s*/g, "").trim();
}

export function cleanSpec(spec: any) {
  const propsToRemove = [
    "apiDir",
    "schemaDir",
    "docsUrl",
    "ui",
    "outputFile",
    "includeOpenApiRoutes",
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
export function getOperationId(routePath: string, method: string) {
  const operation = routePath.replaceAll(/\//g, "-").replace(/^-/, "");

  return `${method}-${operation}`;
}
