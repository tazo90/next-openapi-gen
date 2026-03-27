import type {
  FrameworkConfig,
  OpenApiConfig,
  OpenApiVersion,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
  RouterType,
  SchemaType,
} from "../shared/types.js";

function normalizeRouterType(routerType?: RouterType): RouterType {
  return routerType || "app";
}

function normalizeSchemaTypes(schemaType?: SchemaType | SchemaType[]): SchemaType[] {
  const schemaBackends = Array.isArray(schemaType) ? schemaType : [schemaType || "typescript"];
  return [...new Set(schemaBackends)];
}

function normalizeOpenApiVersion(
  template: Pick<OpenApiTemplate, "openapiVersion" | "openapi">,
): OpenApiVersion {
  if (template.openapiVersion) {
    return template.openapiVersion;
  }

  if (template.openapi.startsWith("3.2")) {
    return "3.2";
  }

  if (template.openapi.startsWith("3.1")) {
    return "3.1";
  }

  if (template.openapi.startsWith("4.")) {
    return "4.0";
  }

  return "3.0";
}

function normalizeFramework(
  config: Pick<OpenApiTemplate, "framework" | "routerType" | "next">,
  routerType: RouterType,
): FrameworkConfig {
  if (config.framework) {
    if (config.framework.kind === "next") {
      return {
        ...config.framework,
        router: config.framework.router || routerType,
        adapterPath: config.framework.adapterPath || config.next?.adapterPath,
      };
    }

    return config.framework;
  }

  return {
    kind: "next",
    router: routerType,
    adapterPath: config.next?.adapterPath,
  };
}

export function normalizeOpenApiConfig(
  template: OpenApiTemplate | OpenApiConfig,
): ResolvedOpenApiConfig {
  const routerType = normalizeRouterType(template.routerType);
  const schemaBackends = normalizeSchemaTypes(template.schemaType);
  const openapiVersion = normalizeOpenApiVersion({
    openapiVersion: template.openapiVersion,
    openapi: "openapi" in template ? template.openapi || "3.0.0" : "3.0.0",
  });

  return {
    apiDir: template.apiDir || "./src/app/api",
    routerType,
    schemaDir: template.schemaDir || "./src",
    docsUrl: template.docsUrl || "api-docs",
    ui: template.ui || "scalar",
    outputFile: template.outputFile || "openapi.json",
    outputDir: template.outputDir || "./public",
    includeOpenApiRoutes: template.includeOpenApiRoutes || false,
    ignoreRoutes: template.ignoreRoutes || [],
    schemaType: template.schemaType || "typescript",
    schemaBackends,
    schemaFiles: template.schemaFiles || [],
    defaultResponseSet: template.defaultResponseSet,
    responseSets: template.responseSets,
    errorConfig: template.errorConfig,
    errorDefinitions: template.errorDefinitions,
    openapiVersion,
    framework: normalizeFramework(template, routerType),
    next: {
      adapterPath: template.next?.adapterPath,
    },
    diagnostics: template.diagnostics || { enabled: true },
    debug: template.debug || false,
  };
}
