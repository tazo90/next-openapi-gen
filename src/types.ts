export type OpenApiConfig = {
  apiDir: string;
  schemaDir: string;
  docsUrl: string;
  ui: string;
  outputFile: string;
  includeOpenApiRoutes: boolean;
  schemaType: "typescript" | "zod";
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
  components: Record<string, any>;
  paths: Record<string, any>;
};

export type RouteDefinition = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: any;
  parameters?: any;
  requestBody?: any;
  responses?: any;
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
  pathParams?: string;
  params?: string;
  body?: string;
  response?: string;
  summary?: string;
  description?: string;
  auth?: string;
  isOpenApi?: boolean;
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
