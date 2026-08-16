import type { OpenApiDocument, OpenApiTemplate } from "../shared/types.js";

const DOCUMENT_CONFIG_KEYS = new Set([
  "apiDir",
  "routerType",
  "schemaDir",
  "docsUrl",
  "ui",
  "outputFile",
  "outputDir",
  "includeOpenApiRoutes",
  "ignoreRoutes",
  "excludeSchemas",
  "schemaType",
  "schemaFiles",
  "defaultResponseSet",
  "responseSets",
  "errorConfig",
  "errorDefinitions",
  "framework",
  "next",
  "diagnostics",
  "cache",
  "experimental",
  "authPresets",
  "arazzo",
  "overlay",
  "debug",
  "generatedDir",
  "watch",
  "clientSdk",
  "docs",
  "hooks",
  "basePath",
  "openapiVersion",
  "schemaBackends",
]);

export function createDocumentFromTemplate(template: OpenApiTemplate): OpenApiDocument {
  const document = structuredClone(template) as OpenApiDocument & Record<string, unknown>;

  for (const key of DOCUMENT_CONFIG_KEYS) {
    delete document[key];
  }

  return document;
}

export function getTemplateServerUrl(template: OpenApiTemplate): string | undefined {
  const basePath = Reflect.get(template, "basePath");
  return typeof basePath === "string" && basePath.length > 0 ? basePath : undefined;
}
