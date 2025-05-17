import { NodePath } from "@babel/traverse";

import { DataTypes } from "../types";

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
  let summary = "";
  let description = "";
  let params = "";
  let pathParams = "";
  let body = "";
  let response = "";
  let auth = "";
  let isOpenApi = false;

  if (comments) {
    comments.forEach((comment) => {
      const commentValue = cleanComment(comment.value);

      isOpenApi = commentValue.includes("@openapi");

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

      if (commentValue.includes("@params")) {
        params = extractTypeFromComment(commentValue, "@params");
      }

      if (commentValue.includes("@pathParams")) {
        pathParams = extractTypeFromComment(commentValue, "@pathParams");
      }

      if (commentValue.includes("@body")) {
        body = extractTypeFromComment(commentValue, "@body");
      }

      if (commentValue.includes("@response")) {
        response = extractTypeFromComment(commentValue, "@response");
      }
    });
  }

  return {
    auth,
    summary,
    description,
    params,
    pathParams,
    body,
    response,
    isOpenApi,
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
