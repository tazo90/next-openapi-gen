export type ResponseSetDefinition = string[]; // ["400:BadRequest", "401:Unauthorized"]
export type ResponseSets = Record<string, ResponseSetDefinition>;

export type SchemaType = "typescript" | "zod";
export type RouterType = "app" | "pages";
export type OpenApiVersion = "3.0" | "3.1" | "3.2" | "4.0";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

export enum FrameworkKind {
  Nextjs = "nextjs",
  Tanstack = "tanstack",
  ReactRouter = "reactrouter",
}

export type LegacyFrameworkKind = "next" | "tanstack" | "react-router";

export type DiagnosticsConfig = {
  enabled?: boolean | undefined;
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

export type FrameworkConfig =
  | NextFrameworkConfig
  | TanstackFrameworkConfig
  | ReactRouterFrameworkConfig;

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  filePath?: string | undefined;
  routePath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
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
  schemaType: SchemaType | SchemaType[]; // Support both single type and array of types
  schemaFiles?: string[] | undefined; // Array of custom OpenAPI schema files (YAML/JSON)
  defaultResponseSet?: string | undefined;
  responseSets?: ResponseSets | undefined;
  errorConfig?: ErrorTemplateConfig | undefined;
  errorDefinitions?: Record<string, ErrorDefinition> | undefined;
  framework?: FrameworkConfig | undefined;
  next?: {
    adapterPath?: string | undefined;
  };
  diagnostics?: DiagnosticsConfig | undefined;
  debug: boolean;
};

export type ResolvedOpenApiConfig = Omit<
  OpenApiConfig,
  "routerType" | "schemaType" | "framework" | "next" | "diagnostics"
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
};

export type OpenApiInfo = {
  title: string;
  version: string;
  description?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiServer = {
  url: string;
  description?: string | undefined;
  name?: string | undefined;
  variables?: Record<string, JsonValue> | undefined;
  [key: string]: unknown;
};

export type OpenApiTagDefinition = {
  name: string;
  description?: string | undefined;
  summary?: string | undefined;
  kind?: string | undefined;
  parent?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiExampleObject = {
  summary?: string | undefined;
  description?: string | undefined;
  value?: JsonValue | undefined;
  externalValue?: string | undefined;
  dataValue?: JsonValue | undefined;
  serializedValue?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiExampleMap = Record<string, OpenApiExampleObject>;

export type OpenApiComponents = {
  securitySchemes?: Record<string, unknown> | undefined;
  schemas?: Record<string, OpenAPIDefinition> | undefined;
  responses?: Record<string, OpenApiResponseDefinition> | undefined;
  parameters?: Record<string, unknown> | undefined;
  requestBodies?: Record<string, unknown> | undefined;
  headers?: Record<string, unknown> | undefined;
  examples?: Record<string, unknown> | undefined;
  links?: Record<string, unknown> | undefined;
  callbacks?: Record<string, unknown> | undefined;
  pathItems?: Record<string, unknown> | undefined;
  [key: string]: unknown;
};

export type OpenApiDocument = {
  openapi: string;
  info: OpenApiInfo;
  servers?: OpenApiServer[] | undefined;
  basePath?: string | undefined;
  components?: OpenApiComponents | undefined;
  paths?: Record<string, OpenApiPathDefinition> | undefined;
  webhooks?: Record<string, unknown> | undefined;
  tags?: OpenApiTagDefinition[] | undefined;
  security?: OpenApiSecurityRequirement[] | undefined;
  externalDocs?: Record<string, unknown> | undefined;
  jsonSchemaDialect?: string | undefined;
  $self?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiTemplate = OpenApiDocument & {
  apiDir?: string | undefined;
  routerType?: RouterType | undefined;
  schemaDir?: string | string[] | undefined;
  docsUrl?: string | undefined;
  ui?: string | undefined;
  outputFile?: string | undefined;
  outputDir?: string | undefined;
  includeOpenApiRoutes?: boolean | undefined;
  ignoreRoutes?: string[] | undefined;
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
  debug?: boolean | undefined;
};

export type RouteDefinition = {
  operationId: string;
  summary?: string | undefined;
  description?: string | undefined;
  tags: string[];
  security?: OpenApiSecurityRequirement[];
  parameters: ParamSchema[];
  requestBody?: OpenApiRequestBody | OpenApiReference | undefined;
  responses?: Record<string, OpenApiResponseDefinition> | undefined;
  deprecated?: boolean;
  [key: string]: unknown;
};

export type OpenApiSchema = {
  type?: string | string[] | undefined;
  properties?: Record<string, OpenApiSchema> | undefined;
  required?: string[] | undefined;
  items?: OpenApiSchemaLike | boolean | undefined;
  prefixItems?: OpenApiSchemaLike[] | undefined;
  nullable?: boolean | undefined;
  description?: string | undefined;
  deprecated?: boolean | undefined;
  format?: string | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  exclusiveMinimum?: number | boolean | undefined;
  exclusiveMaximum?: number | boolean | undefined;
  pattern?: string | undefined;
  minItems?: number | undefined;
  maxItems?: number | undefined;
  uniqueItems?: boolean | undefined;
  enum?: Array<string | number | boolean | null> | undefined;
  default?: JsonValue | undefined;
  example?: JsonValue | undefined;
  examples?: JsonValue[] | Record<string, JsonValue> | undefined;
  oneOf?: OpenApiSchemaLike[] | undefined;
  anyOf?: OpenApiSchemaLike[] | undefined;
  allOf?: OpenApiSchemaLike[] | undefined;
  additionalProperties?: OpenApiSchemaLike | boolean | undefined;
  const?: JsonValue | undefined;
  contentEncoding?: string | undefined;
  contentMediaType?: string | undefined;
  if?: OpenApiSchemaLike | undefined;
  then?: OpenApiSchemaLike | undefined;
  else?: OpenApiSchemaLike | undefined;
  $schema?: string | undefined;
  discriminator?:
    | {
        propertyName: string;
        mapping?: Record<string, string> | undefined;
        defaultMapping?: string | undefined;
      }
    | undefined;
  $ref?: string | undefined;
  [key: string]: unknown;
};

export type ContentType = "params" | "pathParams" | "body" | "response" | "";

export type PropertyOptions = {
  description?: string;
  required?: boolean;
  nullable?: boolean;
};

export type ParamSchema = {
  in: string;
  name: string;
  schema?: OpenApiSchemaLike;
  content?: Record<string, OpenApiMediaTypeDefinition>;
  required?: boolean;
  example?: JsonValue;
  examples?: OpenApiExampleMap | undefined;
  description?: string;
  style?: string | undefined;
  explode?: boolean | undefined;
  allowReserved?: boolean | undefined;
  [key: string]: unknown;
};

export type OpenAPIDefinition = OpenApiSchema;
export type OpenApiReference = OpenApiSchema;
export type OpenApiSchemaLike = OpenApiSchema;
export type OpenApiMediaTypeDefinition = {
  schema?: OpenApiSchemaLike | undefined;
  example?: JsonValue | undefined;
  examples?: OpenApiExampleMap | undefined;
  encoding?: Record<string, JsonValue> | undefined;
  itemSchema?: OpenApiSchemaLike | undefined;
  itemEncoding?: JsonValue | undefined;
  prefixEncoding?: JsonValue[] | undefined;
  [key: string]: unknown;
};
export type OpenApiRequestBody = {
  content: Record<string, OpenApiMediaTypeDefinition>;
  description?: string | undefined;
  required?: boolean | undefined;
  [key: string]: unknown;
};
export type OpenApiResponseObject = {
  description: string;
  content?: Record<string, OpenApiMediaTypeDefinition> | undefined;
  headers?: Record<string, JsonValue> | undefined;
  links?: Record<string, JsonValue> | undefined;
  [key: string]: unknown;
};
export type OpenApiResponseDefinition = OpenApiReference | OpenApiResponseObject;
export type OpenApiSecurityRequirement = Record<string, string[]>;
export type OpenApiPathDefinition = Record<string, RouteDefinition>;

export type JSDocExampleTarget = "request" | "response" | "querystring";

export type JSDocExampleDefinition = {
  target: JSDocExampleTarget;
  name: string;
  summary?: string | undefined;
  description?: string | undefined;
  value?: JsonValue | undefined;
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

export type DataTypes = {
  tag?: string | undefined;
  tagSummary?: string | undefined;
  tagKind?: string | undefined;
  tagParent?: string | undefined;
  pathParamsType?: string | undefined;
  paramsType?: string | undefined;
  querystringType?: string | undefined;
  querystringName?: string | undefined;
  bodyType?: string | undefined;
  responseType?: string | undefined;
  responseContentType?: string | undefined;
  responseItemType?: string | undefined;
  responseItemEncoding?: JsonValue | undefined;
  responsePrefixEncoding?: JsonValue[] | undefined;
  requestExamples?: OpenApiExampleMap | undefined;
  responseExamples?: OpenApiExampleMap | undefined;
  querystringExamples?: OpenApiExampleMap | undefined;
  inferredResponses?: InferredResponseDefinition[] | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  auth?: string | undefined;
  isOpenApi?: boolean | undefined;
  isIgnored?: boolean | undefined;
  deprecated?: boolean | undefined;
  bodyDescription?: string | undefined;
  responseDescription?: string | undefined;
  contentType?: string | undefined;
  responseSet?: string | undefined; // e.g. "authErrors" or "publicErrors,crudErrors"
  addResponses?: string | undefined; // e.g. "409:ConflictResponse,429:RateLimitResponse"
  successCode?: string | undefined; // e.g "201" for POST
  operationId?: string | undefined; // Custom operation ID (overrides auto-generated)
  method?: string | undefined; // HTTP method for Pages Router (e.g. "GET", "POST")
  diagnostics?: Diagnostic[] | undefined;
};

export interface ErrorTemplateConfig {
  template: JsonValue;
  codes: Record<string, ErrorCodeConfig>;
  variables?: Record<string, string>; // Global variables
}

export interface ErrorCodeConfig {
  description: string;
  httpStatus?: number;
  variables?: Record<string, string>; // Per-code variables
}

export interface ErrorDefinition {
  description: string;
  schema: OpenApiSchema;
}
