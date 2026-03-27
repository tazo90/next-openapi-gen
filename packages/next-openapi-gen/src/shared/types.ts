export type ResponseSetDefinition = string[]; // ["400:BadRequest", "401:Unauthorized"]
export type ResponseSets = Record<string, ResponseSetDefinition>;

export type SchemaType = "typescript" | "zod";
export type RouterType = "app" | "pages";
export type OpenApiVersion = "3.0" | "3.1" | "3.2" | "4.0";
export type FrameworkKind = "next" | "tanstack";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

export type DiagnosticsConfig = {
  enabled?: boolean | undefined;
};

export type NextFrameworkConfig = {
  kind: "next";
  router: RouterType;
  adapterPath?: string | undefined;
};

export type TanstackFrameworkConfig = {
  kind: "tanstack";
  adapterPath?: string | undefined;
};

export type FrameworkConfig = NextFrameworkConfig | TanstackFrameworkConfig;

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
  openapiVersion?: OpenApiVersion | undefined;
  framework?: FrameworkConfig | undefined;
  next?: {
    adapterPath?: string | undefined;
  };
  diagnostics?: DiagnosticsConfig | undefined;
  debug: boolean;
};

export type ResolvedOpenApiConfig = Omit<
  OpenApiConfig,
  "routerType" | "schemaType" | "framework" | "next" | "diagnostics" | "openapiVersion"
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

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers?:
    | Array<{
        url: string;
        description: string;
      }>
    | undefined;
  basePath?: string | undefined;
  components?:
    | {
        securitySchemes?: Record<string, JsonValue> | undefined;
        schemas?: Record<string, OpenAPIDefinition> | undefined;
        responses?: Record<string, OpenApiResponseDefinition> | undefined;
      }
    | undefined;
  paths?: Record<string, OpenApiPathDefinition> | undefined;
  webhooks?: Record<string, JsonValue> | undefined;
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
  openapiVersion?: OpenApiVersion | undefined;
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
  requestBody?: OpenApiRequestBody | undefined;
  responses?: Record<string, OpenApiResponseDefinition> | undefined;
  deprecated?: boolean;
};

export type Property = {
  in?: "query" | "path";
  name?: string;
  type?: string;
  description?: string;
  required?: boolean;
  nullable?: boolean;
  enum?: Array<string | number | boolean | null>;
  example?: JsonValue;
  schema?: {
    type: string;
    enum?: Array<string | number | boolean | null>;
    description?: string;
  };
};

export type Params = {
  properties: Record<string, Property>;
};

export type OpenApiSchema = {
  type?: string | undefined;
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
  exclusiveMinimum?: boolean | undefined;
  exclusiveMaximum?: boolean | undefined;
  pattern?: string | undefined;
  minItems?: number | undefined;
  maxItems?: number | undefined;
  uniqueItems?: boolean | undefined;
  enum?: Array<string | number | boolean | null> | undefined;
  default?: JsonValue | undefined;
  example?: JsonValue | undefined;
  oneOf?: OpenApiSchemaLike[] | undefined;
  allOf?: OpenApiSchemaLike[] | undefined;
  additionalProperties?: OpenApiSchemaLike | boolean | undefined;
  discriminator?:
    | {
        propertyName: string;
      }
    | undefined;
  $ref?: string | undefined;
};

export type ContentType = "params" | "pathParams" | "body" | "response" | "";

export type PropertyOptions = {
  description?: string;
  required?: boolean;
  nullable?: boolean;
};

export type SchemaContent = {
  paramsType?: string;
  pathParamsType?: string;
  bodyType?: string;
  responseType?: string;
};

export type ParamSchema = {
  in: string;
  name: string;
  schema: {
    type: string;
    enum?: Array<string | number | boolean | null>;
    description?: string;
  };
  required?: boolean;
  example?: JsonValue;
  description?: string;
};

export type OpenAPIDefinition = OpenApiSchema;
export type OpenApiReference = OpenApiSchema;
export type OpenApiSchemaLike = OpenApiSchema;
export type OpenApiMediaTypeDefinition = {
  schema: OpenApiSchemaLike;
};
export type OpenApiRequestBody = {
  content: Record<string, OpenApiMediaTypeDefinition>;
  description?: string | undefined;
};
export type OpenApiResponseObject = {
  description: string;
  content?: Record<string, OpenApiMediaTypeDefinition> | undefined;
};
export type OpenApiResponseDefinition = OpenApiReference | OpenApiResponseObject;
export type OpenApiSecurityRequirement = Record<string, string[]>;
export type OpenApiPathDefinition = Record<string, RouteDefinition>;

export type DataTypes = {
  tag?: string | undefined;
  pathParamsType?: string | undefined;
  paramsType?: string | undefined;
  bodyType?: string | undefined;
  responseType?: string | undefined;
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
};

export type RouteConfig = {
  schemaDir: string | string[];
  schemaType: string;
  includeOpenApiRoutes?: boolean;
  ignoreRoutes?: string[];
};

export type PathDefinition = RouteDefinition;

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

export interface ErrorConfig {
  globalTemplate?: JsonValue;
  variables?: Record<string, string>;
}

export interface ErrorDefinition {
  description: string;
  schema: OpenApiSchema;
}
