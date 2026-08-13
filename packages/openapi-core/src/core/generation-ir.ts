import type {
  OpenApiParameter,
  OpenApiReference,
  OpenApiRequestBody,
  OpenApiResponseOrReference,
  OpenApiSecurityRequirement,
} from "../openapi/document-types.js";
import { getPathItemOperations } from "../openapi/path-item.js";
import type { OpenApiDocument } from "../shared/types.js";

export type GenerationOperation = {
  operationId?: string | undefined;
  path: string;
  method: string;
  parameters: Array<OpenApiParameter | OpenApiReference>;
  requestBody?: OpenApiRequestBody | OpenApiReference | undefined;
  responses?: Record<string, OpenApiResponseOrReference> | undefined;
  security?: OpenApiSecurityRequirement[] | undefined;
  tags?: string[] | undefined;
};

export type GenerationIR = {
  operations: GenerationOperation[];
  operationsById: Map<string, GenerationOperation>;
};

export function buildGenerationIR(document: OpenApiDocument): GenerationIR {
  const operations: GenerationOperation[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of getPathItemOperations(pathItem)) {
      operations.push({
        operationId: operation.operationId,
        path,
        method,
        parameters: [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])],
        requestBody: operation.requestBody,
        responses: operation.responses,
        security: operation.security,
        tags: operation.tags,
      });
    }
  }

  const operationsById = new Map<string, GenerationOperation>();
  for (const operation of operations) {
    if (operation.operationId) {
      operationsById.set(operation.operationId, operation);
    }
  }

  return { operations, operationsById };
}
