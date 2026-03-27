import type { OpenApiDocument, OpenApiTemplate } from "../shared/types.js";

export function createDocumentFromTemplate(template: OpenApiTemplate): OpenApiDocument {
  return structuredClone(template) as OpenApiDocument;
}
