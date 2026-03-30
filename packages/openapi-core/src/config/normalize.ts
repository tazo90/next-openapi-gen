import type {
  FrameworkConfig,
  FrameworkKind,
  LegacyFrameworkKind,
  OpenApiConfig,
  OpenApiVersion,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
  RouterType,
  SchemaType,
} from "../shared/types.js";
import { FrameworkKind as ResolvedFrameworkKind } from "../shared/types.js";
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

function normalizeOpenApiVersion(template: Pick<OpenApiTemplate, "openapi">): OpenApiVersion {
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

type RawFrameworkConfig = {
  kind?: FrameworkKind | LegacyFrameworkKind | undefined;
  router?: RouterType | undefined;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

function normalizeFrameworkKind(kind: RawFrameworkConfig["kind"]): FrameworkKind {
  switch (kind) {
    case ResolvedFrameworkKind.Nextjs:
    case "next":
      return ResolvedFrameworkKind.Nextjs;
    case ResolvedFrameworkKind.Tanstack:
    case "tanstack":
      return ResolvedFrameworkKind.Tanstack;
    case ResolvedFrameworkKind.ReactRouter:
    case "react-router":
      return ResolvedFrameworkKind.ReactRouter;
    default:
      return ResolvedFrameworkKind.Nextjs;
  }
}

function normalizeFramework(
  config: Pick<OpenApiTemplate, "routerType" | "next"> & {
    framework?: RawFrameworkConfig | undefined;
  },
  routerType: RouterType,
): FrameworkConfig {
  if (config.framework) {
    const frameworkKind = normalizeFrameworkKind(config.framework.kind);

    switch (frameworkKind) {
      case ResolvedFrameworkKind.Nextjs:
        return {
          ...config.framework,
          kind: frameworkKind,
          router: config.framework.router || routerType,
          modulePath:
            config.framework.modulePath || config.framework.adapterPath || config.next?.adapterPath,
          adapterPath: config.framework.adapterPath || config.next?.adapterPath,
        };
      case ResolvedFrameworkKind.Tanstack:
      case ResolvedFrameworkKind.ReactRouter:
        return {
          ...config.framework,
          kind: frameworkKind,
          modulePath: config.framework.modulePath || config.framework.adapterPath,
        };
    }
  }

  return {
    kind: ResolvedFrameworkKind.Nextjs,
    router: routerType,
    modulePath: config.next?.adapterPath,
    adapterPath: config.next?.adapterPath,
  };
}

export function normalizeOpenApiConfig(
  template: OpenApiTemplate | OpenApiConfig,
): ResolvedOpenApiConfig {
  const routerType = normalizeRouterType(template.routerType);
  const schemaBackends = normalizeSchemaTypes(template.schemaType);
  const openapiVersion = normalizeOpenApiVersion({
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
