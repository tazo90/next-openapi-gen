import type { JsonValue } from "../shared/json.js";

export type OpenApiSecurityRequirement = Record<string, string[]>;

export type OpenApiReference = {
  $ref: string;
  summary?: string | undefined;
  description?: string | undefined;
};

export type OpenApiContact = {
  name?: string | undefined;
  url?: string | undefined;
  email?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiLicense = {
  name: string;
  identifier?: string | undefined;
  url?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiInfo = {
  title: string;
  summary?: string | undefined;
  description?: string | undefined;
  termsOfService?: string | undefined;
  contact?: OpenApiContact | undefined;
  license?: OpenApiLicense | undefined;
  version: string;
  [key: string]: unknown;
};

export type OpenApiServerVariable = {
  enum?: string[] | undefined;
  default: string;
  description?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiServer = {
  url: string;
  description?: string | undefined;
  name?: string | undefined;
  variables?: Record<string, OpenApiServerVariable> | undefined;
  [key: string]: unknown;
};

export type OpenApiExternalDocumentation = {
  description?: string | undefined;
  url: string;
  [key: string]: unknown;
};

export type OpenApiTag = {
  name: string;
  summary?: string | undefined;
  description?: string | undefined;
  externalDocs?: OpenApiExternalDocumentation | undefined;
  parent?: string | undefined;
  kind?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiDiscriminator = {
  propertyName: string;
  mapping?: Record<string, string> | undefined;
  defaultMapping?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiXml = {
  nodeType?: "element" | "attribute" | "text" | "cdata" | "none" | (string & {}) | undefined;
  name?: string | undefined;
  namespace?: string | undefined;
  prefix?: string | undefined;
  attribute?: boolean | undefined;
  wrapped?: boolean | undefined;
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
  unevaluatedProperties?: OpenApiSchemaLike | boolean | undefined;
  unevaluatedItems?: OpenApiSchemaLike | boolean | undefined;
  patternProperties?: Record<string, OpenApiSchemaLike> | undefined;
  propertyNames?: OpenApiSchemaLike | undefined;
  dependentRequired?: Record<string, string[]> | undefined;
  dependentSchemas?: Record<string, OpenApiSchemaLike> | undefined;
  not?: OpenApiSchemaLike | undefined;
  readOnly?: boolean | undefined;
  writeOnly?: boolean | undefined;
  xml?: OpenApiXml | undefined;
  const?: JsonValue | undefined;
  contentEncoding?: string | undefined;
  contentMediaType?: string | undefined;
  contentSchema?: OpenApiSchemaLike | undefined;
  $defs?: Record<string, OpenApiSchemaLike> | undefined;
  $id?: string | undefined;
  $anchor?: string | undefined;
  $dynamicAnchor?: string | undefined;
  $dynamicRef?: string | undefined;
  if?: OpenApiSchemaLike | undefined;
  then?: OpenApiSchemaLike | undefined;
  else?: OpenApiSchemaLike | undefined;
  $schema?: string | undefined;
  discriminator?: OpenApiDiscriminator | undefined;
  externalDocs?: OpenApiExternalDocumentation | undefined;
  title?: string | undefined;
  $ref?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiSchemaLike = OpenApiSchema;

export type OpenApiExample = {
  summary?: string | undefined;
  description?: string | undefined;
  value?: JsonValue | undefined;
  externalValue?: string | undefined;
  dataValue?: JsonValue | undefined;
  serializedValue?: string | undefined;
  [key: string]: unknown;
};

export type OpenApiExampleMap = Record<string, OpenApiExample | OpenApiReference>;

export type OpenApiEncoding = {
  contentType?: string | undefined;
  headers?: Record<string, OpenApiHeader | OpenApiReference> | undefined;
  style?: string | undefined;
  explode?: boolean | undefined;
  allowReserved?: boolean | undefined;
  encoding?: Record<string, OpenApiEncoding> | undefined;
  [key: string]: unknown;
};

export type OpenApiMediaType = {
  schema?: OpenApiSchemaLike | undefined;
  example?: JsonValue | undefined;
  examples?: OpenApiExampleMap | undefined;
  encoding?: Record<string, OpenApiEncoding> | undefined;
  itemSchema?: OpenApiSchemaLike | undefined;
  itemEncoding?: OpenApiEncoding | undefined;
  prefixEncoding?: OpenApiEncoding[] | undefined;
  [key: string]: unknown;
};

export type OpenApiHeader = {
  description?: string | undefined;
  required?: boolean | undefined;
  deprecated?: boolean | undefined;
  style?: string | undefined;
  explode?: boolean | undefined;
  schema?: OpenApiSchemaLike | undefined;
  example?: JsonValue | undefined;
  examples?: OpenApiExampleMap | undefined;
  content?: Record<string, OpenApiMediaType | OpenApiReference> | undefined;
  [key: string]: unknown;
};

export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "querystring" | "header" | "cookie" | (string & {});
  description?: string | undefined;
  required?: boolean | undefined;
  deprecated?: boolean | undefined;
  allowEmptyValue?: boolean | undefined;
  style?: string | undefined;
  explode?: boolean | undefined;
  allowReserved?: boolean | undefined;
  schema?: OpenApiSchemaLike | undefined;
  example?: JsonValue | undefined;
  examples?: OpenApiExampleMap | undefined;
  content?: Record<string, OpenApiMediaType | OpenApiReference> | undefined;
  [key: string]: unknown;
};

export type OpenApiRequestBody = {
  description?: string | undefined;
  content: Record<string, OpenApiMediaType | OpenApiReference>;
  required?: boolean | undefined;
  [key: string]: unknown;
};

export type OpenApiLink = {
  operationRef?: string | undefined;
  operationId?: string | undefined;
  parameters?: Record<string, JsonValue> | undefined;
  requestBody?: JsonValue | undefined;
  description?: string | undefined;
  server?: OpenApiServer | undefined;
  [key: string]: unknown;
};

export type OpenApiResponse = {
  summary?: string | undefined;
  description: string;
  headers?: Record<string, OpenApiHeader | OpenApiReference> | undefined;
  content?: Record<string, OpenApiMediaType | OpenApiReference> | undefined;
  links?: Record<string, OpenApiLink | OpenApiReference> | undefined;
  [key: string]: unknown;
};

export type OpenApiResponseOrReference = OpenApiResponse | OpenApiReference;

export type OpenApiCallback = Record<string, OpenApiPathItem | OpenApiReference>;

export type OpenApiOAuthFlow = {
  authorizationUrl?: string | undefined;
  tokenUrl?: string | undefined;
  refreshUrl?: string | undefined;
  deviceAuthorizationUrl?: string | undefined;
  scopes: Record<string, string>;
  [key: string]: unknown;
};

export type OpenApiOAuthFlows = {
  implicit?: OpenApiOAuthFlow | undefined;
  password?: OpenApiOAuthFlow | undefined;
  clientCredentials?: OpenApiOAuthFlow | undefined;
  authorizationCode?: OpenApiOAuthFlow | undefined;
  deviceAuthorization?: OpenApiOAuthFlow | undefined;
  [key: string]: unknown;
};

export type OpenApiSecurityScheme = {
  type: "apiKey" | "http" | "mutualTLS" | "oauth2" | "openIdConnect" | (string & {});
  description?: string | undefined;
  name?: string | undefined;
  in?: string | undefined;
  scheme?: string | undefined;
  bearerFormat?: string | undefined;
  flows?: OpenApiOAuthFlows | undefined;
  openIdConnectUrl?: string | undefined;
  oauth2MetadataUrl?: string | undefined;
  deprecated?: boolean | undefined;
  [key: string]: unknown;
};

export type OpenApiOperation = {
  tags?: string[] | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  externalDocs?: OpenApiExternalDocumentation | undefined;
  operationId?: string | undefined;
  parameters?: Array<OpenApiParameter | OpenApiReference> | undefined;
  requestBody?: OpenApiRequestBody | OpenApiReference | undefined;
  responses?: Record<string, OpenApiResponseOrReference> | undefined;
  callbacks?: Record<string, OpenApiCallback | OpenApiReference> | undefined;
  deprecated?: boolean | undefined;
  security?: OpenApiSecurityRequirement[] | undefined;
  servers?: OpenApiServer[] | undefined;
  [key: string]: unknown;
};

export type OpenApiHttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace"
  | "query";

export const OPENAPI_HTTP_METHODS: readonly OpenApiHttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
];

export type OpenApiPathItem = {
  $ref?: string | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  get?: OpenApiOperation | undefined;
  put?: OpenApiOperation | undefined;
  post?: OpenApiOperation | undefined;
  delete?: OpenApiOperation | undefined;
  options?: OpenApiOperation | undefined;
  head?: OpenApiOperation | undefined;
  patch?: OpenApiOperation | undefined;
  trace?: OpenApiOperation | undefined;
  query?: OpenApiOperation | undefined;
  additionalOperations?: Record<string, OpenApiOperation> | undefined;
  servers?: OpenApiServer[] | undefined;
  parameters?: Array<OpenApiParameter | OpenApiReference> | undefined;
  [key: string]: unknown;
};

export type OpenApiPaths = Record<string, OpenApiPathItem>;

export type OpenApiComponents = {
  schemas?: Record<string, OpenApiSchema> | undefined;
  responses?: Record<string, OpenApiResponseOrReference> | undefined;
  parameters?: Record<string, OpenApiParameter | OpenApiReference> | undefined;
  examples?: Record<string, OpenApiExample | OpenApiReference> | undefined;
  requestBodies?: Record<string, OpenApiRequestBody | OpenApiReference> | undefined;
  headers?: Record<string, OpenApiHeader | OpenApiReference> | undefined;
  securitySchemes?: Record<string, OpenApiSecurityScheme | OpenApiReference> | undefined;
  links?: Record<string, OpenApiLink | OpenApiReference> | undefined;
  callbacks?: Record<string, OpenApiCallback | OpenApiReference> | undefined;
  pathItems?: Record<string, OpenApiPathItem> | undefined;
  mediaTypes?: Record<string, OpenApiMediaType | OpenApiReference> | undefined;
  [key: string]: unknown;
};

export type OpenApiDocument = {
  openapi: string;
  $self?: string | undefined;
  info: OpenApiInfo;
  jsonSchemaDialect?: string | undefined;
  servers?: OpenApiServer[] | undefined;
  paths?: OpenApiPaths | undefined;
  webhooks?: Record<string, OpenApiPathItem> | undefined;
  components?: OpenApiComponents | undefined;
  security?: OpenApiSecurityRequirement[] | undefined;
  tags?: OpenApiTag[] | undefined;
  externalDocs?: OpenApiExternalDocumentation | undefined;
  [key: string]: unknown;
};
