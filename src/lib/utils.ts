import { NodePath } from "@babel/traverse";

import { DataTypes } from "../types";

export function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function extractJSDocComments(path: NodePath): DataTypes {
  const comments = path.node.leadingComments;
  let summary = "";
  let description = "";
  let paramsType = "";
  let pathParamsType = "";
  let bodyType = "";
  let responseType = "";
  let auth = "";
  let isOpenApi = false;

  if (comments) {
    comments.forEach((comment) => {
      const commentValue = cleanComment(comment.value);

      isOpenApi = commentValue.includes("@openapi");

      if (!summary) {
        const summaryIndex = isOpenApi ? 1 : 0;
        summary = commentValue.split("\n")[summaryIndex];
      }

      if (commentValue.includes("@auth")) {
        const regex = /@auth:\s*(.*)/;
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
        const regex = /@desc:\s*(.*)/;
        description = commentValue.match(regex)[1].trim();
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
    auth,
    summary,
    description,
    paramsType,
    pathParamsType,
    bodyType,
    responseType,
    isOpenApi,
  };
}

export function extractTypeFromComment(
  commentValue: string,
  tag: string
): string {
  return commentValue.match(new RegExp(`${tag}\\s*:\\s*(\\w+)`))?.[1] || "";
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

  return newSpec;
}

export function getOperationId(routePath: string, method: string) {
  const operation = routePath.replaceAll(/\//g, "-").replace(/^-/, "");

  return `${method}-${operation}`;
}
