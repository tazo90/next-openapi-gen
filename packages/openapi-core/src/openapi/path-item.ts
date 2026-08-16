import {
  OPENAPI_HTTP_METHODS,
  type OpenApiHttpMethod,
  type OpenApiOperation,
  type OpenApiPathItem,
} from "./document-types.js";

const HTTP_METHOD_SET = new Set<string>(OPENAPI_HTTP_METHODS);

export function isOpenApiHttpMethod(method: string): method is OpenApiHttpMethod {
  return HTTP_METHOD_SET.has(method);
}

export function getPathItemOperations(
  pathItem: OpenApiPathItem,
): Array<[string, OpenApiOperation]> {
  const operations: Array<[string, OpenApiOperation]> = [];

  for (const method of OPENAPI_HTTP_METHODS) {
    const operation = pathItem[method];
    if (operation) {
      operations.push([method, operation]);
    }
  }

  if (pathItem.additionalOperations) {
    for (const [method, operation] of Object.entries(pathItem.additionalOperations)) {
      operations.push([method, operation]);
    }
  }

  return operations;
}

export function setPathItemOperation(
  pathItem: OpenApiPathItem,
  method: string,
  operation: OpenApiOperation,
): void {
  const normalizedMethod = method.toLowerCase();

  if (isOpenApiHttpMethod(normalizedMethod)) {
    pathItem[normalizedMethod] = operation;
    return;
  }

  pathItem.additionalOperations ??= {};
  pathItem.additionalOperations[method] = operation;
}
