export type ResponseSetDefinition = string[]; // ["400:BadRequest", "401:Unauthorized"]
export type ResponseSets = Record<string, ResponseSetDefinition>;

export type OpenApiConfig = {
  apiDir: string;
  schemaDir: string;
  docsUrl: string;
  ui: string;
  outputFile: string;
  includeOpenApiRoutes: boolean;
  schemaType: "typescript" | "zod";
  defaultResponseSet?: string;
  responseSets?: ResponseSets;
  errorConfig?: ErrorTemplateConfig;
  errorDefinitions?: Record<string, ErrorDefinition>;
};

export type OpenApiTemplate = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  basePath: string;
  components?: {
    securitySchemes?: Record<string, any>;
    schemas?: Record<string, any>;
    responses?: Record<string, any>;
  };
  paths: Record<string, any>;
};

export type RouteDefinition = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, any>>;
  parameters?: ParamSchema[];
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
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  nullable?: boolean;
  description?: string;
  deprecated?: boolean;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  enum?: Array<string | number | boolean | null>;
  default?: any;
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  additionalProperties?: OpenApiSchema | boolean;
  discriminator?: {
    propertyName: string;
  };
  $ref?: string;
};

export type SchemaType = "typescript" | "zod";
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
  type?: string;
  properties?: Record<string, any>;
  items?: any;
  enum?: any[];
  format?: string;
  nullable?: boolean;
  required?: string[];
  oneOf?: any[];
  additionalProperties?: any;
  $ref?: string;
  [key: string]: any;
};

export type DataTypes = {
  tag?: string;
  pathParamsType?: string;
  paramsType?: string;
  bodyType?: string;
  responseType?: string;
  summary?: string;
  description?: string;
  auth?: string;
  isOpenApi?: boolean;
  deprecated?: boolean;
  bodyDescription?: string;
  responseDescription?: string;
  contentType?: string;
  responseSet?: string; // e.g. "authErrors" or "publicErrors,crudErrors"
  addResponses?: string; // e.g. "409:ConflictResponse,429:RateLimitResponse"
  successCode?: string; // e.g "201" for POST
};

export type RouteConfig = {
  schemaDir: string;
  schemaType: string;
  includeOpenApiRoutes?: boolean;
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
