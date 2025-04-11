export type OpenApiConfig = {
  apiDir: string;
  schemaDir: string;
  docsUrl: string;
  ui: string;
  outputFile: string;
  includeOpenApiRoutes: boolean;
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
  paths: Record<string, any>;
};

export type DataTypes = {
  auth: string;
  summary: string;
  description: string;
  paramsType: string;
  pathParamsType: string;
  bodyType: string;
  responseType: string;
  isOpenApi: boolean;
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
  schema?: {
    type: string;
    enum?: any;
    description?: string;
  };
};

export type Params = {
  properties: Record<string, Property>;
};
