import type { OpenApiDocument, OpenApiTemplate } from "../shared/types.js";

export function createDocumentFromTemplate(template: OpenApiTemplate): OpenApiDocument {
  const { openapi, info, servers, basePath, components, paths, webhooks } = template;

  return {
    openapi,
    info: {
      title: info.title,
      version: info.version,
      description: info.description,
    },
    servers,
    basePath,
    components: components
      ? {
          securitySchemes: components.securitySchemes,
          schemas: components.schemas,
          responses: components.responses,
        }
      : undefined,
    paths,
    webhooks,
  };
}
