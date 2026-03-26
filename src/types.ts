export type ResponseSetDefinition = string[]; // ["400:BadRequest", "401:Unauthorized"]
export type ResponseSets = Record<string, ResponseSetDefinition>;

export type SchemaType = "typescript" | "zod";
export type RouterType = "app" | "pages";

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
  debug: boolean;
};

export type OpenApiTemplate = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers?: Array<{
    url: string;
    description: string;
  }> | undefined;
  basePath?: string | undefined;
  components?: {
    securitySchemes?: Record<string, any> | undefined;
    schemas?: Record<string, any> | undefined;
    responses?: Record<string, any> | undefined;
  } | undefined;
  paths?: Record<string, any> | undefined;
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
  debug?: boolean | undefined;
};

export type RouteDefinition = {
  operationId: string;
  summary?: string | undefined;
  description?: string | undefined;
  tags: string[];
  security?: Array<Record<string, any>>;
  parameters: ParamSchema[];
  requestBody?: any;
  responses?: Record<string, any>;
  deprecated?: boolean;
};

export type Property = {
  in?: "query" | "path";
  name?: string;
  type?: string;
  description?: string;
  required?: boolean;
  nullable?: boolean;
  enum?: any;
  example?: string;
  schema?: {
    type: string;
    enum?: any;
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
  items?: OpenApiSchema | undefined;
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
  default?: any;
  oneOf?: OpenApiSchema[] | undefined;
  allOf?: OpenApiSchema[] | undefined;
  additionalProperties?: OpenApiSchema | boolean | undefined;
  discriminator?: {
    propertyName: string;
  } | undefined;
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
    enum?: (string | number | boolean)[];
    description?: string;
  };
  required?: boolean;
  example?: any;
  description?: string;
};

export type OpenAPIDefinition = {
  type?: string | undefined;
  properties?: Record<string, any> | undefined;
  items?: any;
  enum?: any[] | undefined;
  format?: string | undefined;
  nullable?: boolean | undefined;
  required?: string[] | undefined;
  oneOf?: any[] | undefined;
  additionalProperties?: any;
  $ref?: string | undefined;
  [key: string]: any;
};

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

export type PathDefinition = {
  operationId: string;
  summary?: string;
  description?: string;
  tags: string[];
  security?: Array<Record<string, any[]>>;
  parameters: any[];
  requestBody?: any;
  responses: Record<string, any>;
};

export interface ErrorTemplateConfig {
  template: any; // Any schema template with placeholders
  codes: Record<string, ErrorCodeConfig>;
  variables?: Record<string, string>; // Global variables
}

export interface ErrorCodeConfig {
  description: string;
  httpStatus?: number;
  variables?: Record<string, string>; // Per-code variables
}

export interface ErrorConfig {
  globalTemplate?: any;
  variables?: Record<string, string>;
}

export interface ErrorDefinition {
  description: string;
  schema: any;
}
