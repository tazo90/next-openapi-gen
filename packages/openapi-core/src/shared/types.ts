import type {
  OpenApiDocument,
  OpenApiEncoding,
  OpenApiExample,
  OpenApiExampleMap,
  OpenApiExternalDocumentation,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiResponse,
  OpenApiResponseOrReference,
  OpenApiSchema,
  OpenApiSchemaLike,
  OpenApiSecurityRequirement,
  OpenApiServer,
  OpenApiTag,
} from "../openapi/document-types.js";
import type { JsonValue } from "./json.js";

export type { JsonPrimitive, JsonValue } from "./json.js";
export type {
  OpenApiCallback,
  OpenApiComponents,
  OpenApiContact,
  OpenApiDiscriminator,
  OpenApiDocument,
  OpenApiEncoding,
  OpenApiExample,
  OpenApiExampleMap,
  OpenApiExternalDocumentation,
  OpenApiHeader,
  OpenApiHttpMethod,
  OpenApiInfo,
  OpenApiLicense,
  OpenApiLink,
  OpenApiMediaType,
  OpenApiOAuthFlow,
  OpenApiOAuthFlows,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiPaths,
  OpenApiReference,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiResponseOrReference,
  OpenApiSchema,
  OpenApiSchemaLike,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  OpenApiServer,
  OpenApiServerVariable,
  OpenApiTag,
  OpenApiXml,
} from "../openapi/document-types.js";
export { OPENAPI_HTTP_METHODS } from "../openapi/document-types.js";

export type ResponseSetDefinition = string[];
export type ResponseSets = Record<string, ResponseSetDefinition>;

export type SchemaType = "typescript" | "zod";
export type RouterType = "app" | "pages";
export type OpenApiVersion = "3.0" | "3.1" | "3.2" | "3.3-preview";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticFailOn = "error" | "warning" | "never";

export enum FrameworkKind {
  Nextjs = "nextjs",
  Tanstack = "tanstack",
  ReactRouter = "reactrouter",
  Remix = "remix",
  SvelteKit = "sveltekit",
  Nuxt = "nuxt",
  Astro = "astro",
  Hono = "hono",
  Express = "express",
}

export type LegacyFrameworkKind =
  | "next"
  | "tanstack"
  | "react-router"
  | "remix"
  | "sveltekit"
  | "nuxt"
  | "astro"
  | "hono"
  | "express";

export type DiagnosticsConfig = {
  enabled?: boolean | undefined;
  failOn?: DiagnosticFailOn | undefined;
};

export type NextFrameworkConfig = {
  kind: FrameworkKind.Nextjs;
  router: RouterType;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type TanstackFrameworkConfig = {
  kind: FrameworkKind.Tanstack;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type ReactRouterFrameworkConfig = {
  kind: FrameworkKind.ReactRouter;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type RemixFrameworkConfig = {
  kind: FrameworkKind.Remix;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type SvelteKitFrameworkConfig = {
  kind: FrameworkKind.SvelteKit;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type NuxtFrameworkConfig = {
  kind: FrameworkKind.Nuxt;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type AstroFrameworkConfig = {
  kind: FrameworkKind.Astro;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type HonoFrameworkConfig = {
  kind: FrameworkKind.Hono;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type ExpressFrameworkConfig = {
  kind: FrameworkKind.Express;
  modulePath?: string | undefined;
  adapterPath?: string | undefined;
};

export type FileFrameworkConfig =
  | RemixFrameworkConfig
  | SvelteKitFrameworkConfig
  | NuxtFrameworkConfig
  | AstroFrameworkConfig
  | HonoFrameworkConfig
  | ExpressFrameworkConfig;

export type FrameworkConfig =
  | NextFrameworkConfig
  | TanstackFrameworkConfig
  | ReactRouterFrameworkConfig
  | FileFrameworkConfig;

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  filePath?: string | undefined;
  routePath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type ArazzoGeneratorConfig = {
  version?: "1.0.0" | "1.1.0" | (string & {}) | undefined;
  files?: string[] | undefined;
  outputFile?: string | undefined;
  outputDir?: string | undefined;
};

export type OverlayGenerateConfig = {
  files?: string[] | undefined;
  outputFile?: string | undefined;
  outputDir?: string | undefined;
};

export type OverlayGeneratorConfig = {
  version?: "1.0.0" | "1.1.0" | "1.2.0" | (string & {}) | undefined;
  apply?: string[] | undefined;
  generate?: OverlayGenerateConfig | undefined;
};

export type OpenApiConfig = {
  apiDir: string;
  routerType?: RouterType | undefined;
  schemaDir: string | string[];
  docsUrl: string;
  ui: string;
  outputFile: string;
  outputDir: string;
  includeOpenApiRoutes: boolean;
  ignoreRoutes?: string[] | undefined;
  excludeSchemas?: string[] | undefined;
  schemaType: SchemaType | SchemaType[];
  schemaFiles?: string[] | undefined;
  defaultResponseSet?: string | undefined;
  responseSets?: ResponseSets | undefined;
  errorConfig?: ErrorTemplateConfig | undefined;
  errorDefinitions?: Record<string, ErrorDefinition> | undefined;
  framework?: FrameworkConfig | undefined;
  next?: {
    adapterPath?: string | undefined;
  };
  diagnostics?: DiagnosticsConfig | undefined;
  cache?: boolean | undefined;
  experimental?: GeneratorExperimentalConfig | undefined;
  authPresets?: Record<string, string> | undefined;
  arazzo?: ArazzoGeneratorConfig | undefined;
  overlay?: OverlayGeneratorConfig | undefined;
  debug: boolean;
};

export type GeneratorExperimentalConfig = {
  parallelRoutes?: boolean | undefined;
};

export type ResolvedOpenApiConfig = Omit<
  OpenApiConfig,
  "routerType" | "schemaType" | "framework" | "next" | "diagnostics" | "authPresets"
> & {
  framework: FrameworkConfig;
  next: {
    adapterPath?: string | undefined;
  };
  diagnostics: DiagnosticsConfig;
  routerType: RouterType;
  schemaType: SchemaType | SchemaType[];
  schemaBackends: SchemaType[];
  openapiVersion: OpenApiVersion;
  authPresets: Record<string, string>;
};

export type OpenApiGeneratorConfigFields = {
  apiDir?: string | undefined;
  routerType?: RouterType | undefined;
  schemaDir?: string | string[] | undefined;
  docsUrl?: string | undefined;
  ui?: string | undefined;
  outputFile?: string | undefined;
  outputDir?: string | undefined;
  includeOpenApiRoutes?: boolean | undefined;
  ignoreRoutes?: string[] | undefined;
  excludeSchemas?: string[] | undefined;
  schemaType?: SchemaType | SchemaType[] | undefined;
  schemaFiles?: string[] | undefined;
  defaultResponseSet?: string | undefined;
  responseSets?: ResponseSets | undefined;
  errorConfig?: ErrorTemplateConfig | undefined;
  errorDefinitions?: Record<string, ErrorDefinition> | undefined;
  framework?: FrameworkConfig | undefined;
  next?: {
    adapterPath?: string | undefined;
  };
  diagnostics?: DiagnosticsConfig | undefined;
  cache?: boolean | undefined;
  experimental?: GeneratorExperimentalConfig | undefined;
  authPresets?: Record<string, string> | undefined;
  arazzo?: ArazzoGeneratorConfig | undefined;
  overlay?: OverlayGeneratorConfig | undefined;
  debug?: boolean | undefined;
};

export type OpenApiTemplate = OpenApiDocument & OpenApiGeneratorConfigFields;

/** @deprecated Use OpenApiOperation */
export type RouteDefinition = OpenApiOperation;
/** @deprecated Use OpenApiParameter */
export type ParamSchema = OpenApiParameter;
/** @deprecated Use OpenApiSchema */
export type OpenAPIDefinition = OpenApiSchema;
/** @deprecated Use OpenApiMediaType */
export type OpenApiMediaTypeDefinition = OpenApiMediaType;
/** @deprecated Use OpenApiResponse */
export type OpenApiResponseObject = OpenApiResponse;
/** @deprecated Use OpenApiResponseOrReference */
export type OpenApiResponseDefinition = OpenApiResponseOrReference;
/** @deprecated Use OpenApiPathItem */
export type OpenApiPathDefinition = OpenApiPathItem;
/** @deprecated Use OpenApiTag */
export type OpenApiTagDefinition = OpenApiTag;
/** @deprecated Use OpenApiExample */
export type OpenApiExampleObject = OpenApiExample;

export type ContentType = "params" | "pathParams" | "body" | "response" | "";

export type PropertyOptions = {
  description?: string;
  required?: boolean;
  nullable?: boolean;
  example?: unknown;
  format?: string;
};

export type JSDocExampleTarget =
  | "request"
  | "response"
  | "querystring"
  | "query"
  | "header"
  | "cookie";

export type JSDocExampleDefinition = {
  target: JSDocExampleTarget;
  name: string;
  summary?: string | undefined;
  description?: string | undefined;
  value?: JsonValue | undefined;
  dataValue?: JsonValue | undefined;
  serializedValue?: string | undefined;
  externalValue?: string | undefined;
};

export type InferredResponseDefinition = {
  statusCode?: string | undefined;
  typeName?: string | undefined;
  schema?: OpenApiSchemaLike | undefined;
  description?: string | undefined;
  contentType?: string | undefined;
  itemTypeName?: string | undefined;
  source: "typescript";
};

export type JSDocResponseHeader = {
  status: string;
  name: string;
  description?: string | undefined;
  schema?: OpenApiSchemaLike | undefined;
};

export type JSDocResponseLink = {
  status: string;
  name: string;
  operationId?: string | undefined;
  operationRef?: string | undefined;
  parameters?: Record<string, JsonValue> | undefined;
  requestBody?: JsonValue | undefined;
  description?: string | undefined;
  server?: OpenApiServer | undefined;
};

export type JSDocExternalDocs = OpenApiExternalDocumentation;

export type JSDocCallback = {
  name: string;
  expression: string;
  reference?: string | undefined;
};

export type DataTypes = {
  tag?: string | undefined;
  tagSummary?: string | undefined;
  tagDescription?: string | undefined;
  tagKind?: string | undefined;
  tagParent?: string | undefined;
  tags?: string[] | undefined;
  pathParamsType?: string | undefined;
  paramsType?: string | undefined;
  querystringType?: string | undefined;
  querystringName?: string | undefined;
  bodyType?: string | undefined;
  requestBodyRequired?: boolean | undefined;
  headerType?: string | undefined;
  cookieType?: string | undefined;
  responseType?: string | undefined;
  responseContentType?: string | undefined;
  responseItemType?: string | undefined;
  responseItemEncoding?: OpenApiEncoding | undefined;
  responsePrefixEncoding?: OpenApiEncoding[] | undefined;
  requestItemType?: string | undefined;
  requestItemEncoding?: OpenApiEncoding | undefined;
  requestPrefixEncoding?: OpenApiEncoding[] | undefined;
  requestExamples?: OpenApiExampleMap | undefined;
  responseExamples?: OpenApiExampleMap | undefined;
  querystringExamples?: OpenApiExampleMap | undefined;
  queryExamples?: OpenApiExampleMap | undefined;
  headerExamples?: OpenApiExampleMap | undefined;
  cookieExamples?: OpenApiExampleMap | undefined;
  inferredPathParamsType?: string | undefined;
  inferredQueryParamsType?: string | undefined;
  inferredBodyType?: string | undefined;
  inferredResponses?: InferredResponseDefinition[] | undefined;
  inferredQueryParamNames?: string[] | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  auth?: string | undefined;
  security?: OpenApiSecurityRequirement[] | undefined;
  servers?: OpenApiServer[] | undefined;
  externalDocs?: JSDocExternalDocs | undefined;
  responseHeaders?: JSDocResponseHeader[] | undefined;
  responseLinks?: JSDocResponseLink[] | undefined;
  callbacks?: JSDocCallback[] | undefined;
  openapiOverride?: Record<string, JsonValue> | undefined;
  isOpenApi?: boolean | undefined;
  isIgnored?: boolean | undefined;
  isWebhook?: boolean | undefined;
  webhookName?: string | undefined;
  deprecated?: boolean | undefined;
  deprecationReason?: string | undefined;
  bodyDescription?: string | undefined;
  responseDescription?: string | undefined;
  responseSummary?: string | undefined;
  responseSummaries?: Record<string, string> | undefined;
  contentType?: string | undefined;
  responseSet?: string | undefined;
  addResponses?: string | undefined;
  successCode?: string | undefined;
  operationId?: string | undefined;
  method?: string | undefined;
  diagnostics?: Diagnostic[] | undefined;
};

export interface ErrorTemplateConfig {
  template: JsonValue;
  codes: Record<string, ErrorCodeConfig>;
  variables?: Record<string, string>;
}

export interface ErrorCodeConfig {
  description: string;
  httpStatus?: number;
  variables?: Record<string, string>;
}

export interface ErrorDefinition {
  description: string;
  schema: OpenApiSchema;
}

export type {
  OpenApiComponents as OpenApiComponentsObject,
  OpenApiInfo as OpenApiInfoObject,
  OpenApiServer as OpenApiServerObject,
} from "../openapi/document-types.js";
