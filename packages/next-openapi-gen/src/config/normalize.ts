import type {
  FrameworkConfig,
  OpenApiConfig,
  OpenApiVersion,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
  RouterType,
  SchemaType,
} from "../shared/types.js";
import {
  DEFAULT_API_DIR,
  DEFAULT_DEBUG,
  DEFAULT_DIAGNOSTICS_ENABLED,
  DEFAULT_DOCS_URL,
  DEFAULT_GENERATED_OPENAPI_FILENAME,
  DEFAULT_INCLUDE_OPENAPI_ROUTES,
  DEFAULT_OPENAPI_VERSION,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_ROUTER_TYPE,
  DEFAULT_RUNTIME_SCHEMA_TYPE,
  DEFAULT_SCHEMA_DIR,
  DEFAULT_UI,
} from "./defaults.js";

function normalizeRouterType(routerType?: RouterType): RouterType {
  return routerType ?? DEFAULT_ROUTER_TYPE;
}

function normalizeSchemaTypes(schemaType?: SchemaType | SchemaType[]): SchemaType[] {
  const schemaBackends = Array.isArray(schemaType)
    ? schemaType
    : [schemaType ?? DEFAULT_RUNTIME_SCHEMA_TYPE];
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

  return DEFAULT_OPENAPI_VERSION;
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
    apiDir: template.apiDir ?? DEFAULT_API_DIR,
    routerType,
    schemaDir: template.schemaDir ?? DEFAULT_SCHEMA_DIR,
    docsUrl: template.docsUrl ?? DEFAULT_DOCS_URL,
    ui: template.ui ?? DEFAULT_UI,
    outputFile: template.outputFile ?? DEFAULT_GENERATED_OPENAPI_FILENAME,
    outputDir: template.outputDir ?? DEFAULT_OUTPUT_DIR,
    includeOpenApiRoutes: template.includeOpenApiRoutes ?? DEFAULT_INCLUDE_OPENAPI_ROUTES,
    ignoreRoutes: template.ignoreRoutes ?? [],
    schemaType: template.schemaType ?? DEFAULT_RUNTIME_SCHEMA_TYPE,
    schemaBackends,
    schemaFiles: template.schemaFiles ?? [],
    defaultResponseSet: template.defaultResponseSet,
    responseSets: template.responseSets,
    errorConfig: template.errorConfig,
    errorDefinitions: template.errorDefinitions,
    openapiVersion,
    framework: normalizeFramework(template, routerType),
    next: {
      adapterPath: template.next?.adapterPath,
    },
    diagnostics: template.diagnostics ?? { enabled: DEFAULT_DIAGNOSTICS_ENABLED },
    debug: template.debug ?? DEFAULT_DEBUG,
  };
}
