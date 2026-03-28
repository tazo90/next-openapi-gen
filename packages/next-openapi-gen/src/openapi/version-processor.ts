import { cleanSpec } from "../shared/utils.js";
import type {
  OpenApiDocument,
  OpenApiExampleMap,
  OpenApiMediaTypeDefinition,
  OpenApiPathDefinition,
  OpenApiRequestBody,
  OpenApiResponseDefinition,
  OpenApiSchema,
  OpenApiTagDefinition,
  OpenApiVersion,
  ParamSchema,
  RouteDefinition,
} from "../shared/types.js";

interface OpenApiVersionProcessor {
  readonly id: OpenApiVersion;
  readonly version: string;
  finalize(document: OpenApiDocument): OpenApiDocument;
}

type OpenApiVersionCapabilities = {
  readonly supportsJsonSchemaDialect: boolean;
  readonly supportsOpenApi31Schema: boolean;
  readonly supportsRichExamples: boolean;
  readonly supportsQuerystring: boolean;
  readonly supportsEnhancedTags: boolean;
  readonly supportsAdditionalOperations: boolean;
  readonly supportsSequentialMedia: boolean;
  readonly supportsServerName: boolean;
  readonly supportsDocumentSelf: boolean;
  readonly supportsOauthMetadata: boolean;
  readonly supportsDeviceAuthorization: boolean;
};

class DefaultOpenApiVersionProcessor implements OpenApiVersionProcessor {
  constructor(
    public readonly id: OpenApiVersion,
    public readonly version: string,
    private readonly capabilities: OpenApiVersionCapabilities,
  ) {}

  finalize(document: OpenApiDocument): OpenApiDocument {
    const nextDocument = structuredClone(document);
    nextDocument.openapi = this.version;

    if (!this.capabilities.supportsJsonSchemaDialect) {
      delete nextDocument.jsonSchemaDialect;
    }

    if (!this.capabilities.supportsDocumentSelf) {
      delete nextDocument.$self;
    }

    if (nextDocument.servers) {
      nextDocument.servers = nextDocument.servers.map((server) => {
        const nextServer = structuredClone(server);
        if (!this.capabilities.supportsServerName) {
          delete nextServer.name;
        }
        return nextServer;
      });
    }

    if (nextDocument.tags) {
      nextDocument.tags = nextDocument.tags.map(
        (tag) => transformTagDefinition(tag, this.capabilities) as OpenApiTagDefinition,
      );
    }

    if (nextDocument.components?.schemas) {
      nextDocument.components.schemas = Object.fromEntries(
        Object.entries(nextDocument.components.schemas).map(([name, schema]) => [
          name,
          transformSchema(schema, this.capabilities),
        ]),
      );
    }

    if (nextDocument.components?.responses) {
      nextDocument.components.responses = Object.fromEntries(
        Object.entries(nextDocument.components.responses).map(([name, response]) => [
          name,
          transformResponseDefinition(response, this.capabilities),
        ]),
      );
    }

    if (nextDocument.components?.parameters) {
      nextDocument.components.parameters = Object.fromEntries(
        Object.entries(nextDocument.components.parameters).map(([name, parameter]) => [
          name,
          transformParameterDefinition(parameter, this.capabilities),
        ]),
      ) as Record<string, unknown>;
    }

    if (nextDocument.components?.requestBodies) {
      nextDocument.components.requestBodies = Object.fromEntries(
        Object.entries(nextDocument.components.requestBodies).map(([name, requestBody]) => [
          name,
          transformRequestBodyDefinition(requestBody, this.capabilities),
        ]),
      ) as Record<string, unknown>;
    }

    if (nextDocument.components?.securitySchemes) {
      nextDocument.components.securitySchemes = Object.fromEntries(
        Object.entries(nextDocument.components.securitySchemes).map(([name, scheme]) => [
          name,
          transformSecurityScheme(scheme, this.capabilities),
        ]),
      ) as Record<string, unknown>;
    }

    if (nextDocument.paths) {
      nextDocument.paths = transformPathCollection(nextDocument.paths, this.capabilities);
    }

    if (nextDocument.webhooks) {
      nextDocument.webhooks = transformWebhookCollection(
        nextDocument.webhooks,
        this.capabilities,
      ) as Record<string, unknown>;
    }

    return cleanSpec(nextDocument);
  }
}

const OPENAPI_VERSION_PROCESSORS: Record<OpenApiVersion, OpenApiVersionProcessor> = {
  "3.0": new DefaultOpenApiVersionProcessor("3.0", "3.0.0", {
    supportsJsonSchemaDialect: false,
    supportsOpenApi31Schema: false,
    supportsRichExamples: false,
    supportsQuerystring: false,
    supportsEnhancedTags: false,
    supportsAdditionalOperations: false,
    supportsSequentialMedia: false,
    supportsServerName: false,
    supportsDocumentSelf: false,
    supportsOauthMetadata: false,
    supportsDeviceAuthorization: false,
  }),
  "3.1": new DefaultOpenApiVersionProcessor("3.1", "3.1.0", {
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: false,
    supportsQuerystring: false,
    supportsEnhancedTags: false,
    supportsAdditionalOperations: false,
    supportsSequentialMedia: false,
    supportsServerName: false,
    supportsDocumentSelf: false,
    supportsOauthMetadata: false,
    supportsDeviceAuthorization: false,
  }),
  "3.2": new DefaultOpenApiVersionProcessor("3.2", "3.2.0", {
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: true,
    supportsQuerystring: true,
    supportsEnhancedTags: true,
    supportsAdditionalOperations: true,
    supportsSequentialMedia: true,
    supportsServerName: true,
    supportsDocumentSelf: true,
    supportsOauthMetadata: true,
    supportsDeviceAuthorization: true,
  }),
  "4.0": new DefaultOpenApiVersionProcessor("4.0", "4.0.0", {
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: true,
    supportsQuerystring: true,
    supportsEnhancedTags: true,
    supportsAdditionalOperations: true,
    supportsSequentialMedia: true,
    supportsServerName: true,
    supportsDocumentSelf: true,
    supportsOauthMetadata: true,
    supportsDeviceAuthorization: true,
  }),
};

export function getOpenApiVersionProcessor(
  openapiVersion: OpenApiVersion,
): OpenApiVersionProcessor {
  return OPENAPI_VERSION_PROCESSORS[openapiVersion];
}

function transformPathCollection(
  paths: Record<string, OpenApiPathDefinition>,
  capabilities: OpenApiVersionCapabilities,
): Record<string, OpenApiPathDefinition> {
  return Object.fromEntries(
    Object.entries(paths).map(([path, definition]) => [
      path,
      transformPathItem(definition, capabilities),
    ]),
  ) as Record<string, OpenApiPathDefinition>;
}

function transformWebhookCollection(
  webhooks: Record<string, unknown>,
  capabilities: OpenApiVersionCapabilities,
) {
  return Object.fromEntries(
    Object.entries(webhooks).map(([name, definition]) => [
      name,
      transformPathItem(definition, capabilities),
    ]),
  );
}

function transformPathItem(definition: unknown, capabilities: OpenApiVersionCapabilities) {
  if (!isRecord(definition)) {
    return definition;
  }

  const nextDefinition = structuredClone(definition);

  if (Array.isArray(nextDefinition.parameters)) {
    nextDefinition.parameters = nextDefinition.parameters.map((parameter) =>
      transformParameterDefinition(parameter, capabilities),
    );
  }

  if (isRecord(nextDefinition.additionalOperations)) {
    if (!capabilities.supportsAdditionalOperations) {
      delete nextDefinition.additionalOperations;
    } else {
      nextDefinition.additionalOperations = Object.fromEntries(
        Object.entries(nextDefinition.additionalOperations).map(([name, operation]) => [
          name,
          transformOperation(operation, capabilities),
        ]),
      );
    }
  }

  for (const [method, operation] of Object.entries(nextDefinition)) {
    if (!HTTP_METHODS.has(method)) {
      continue;
    }

    nextDefinition[method] = transformOperation(operation, capabilities);
  }

  return nextDefinition;
}

function transformOperation(operation: unknown, capabilities: OpenApiVersionCapabilities) {
  if (!isRecord(operation)) {
    return operation;
  }

  const nextOperation = structuredClone(operation) as RouteDefinition;

  if (Array.isArray(nextOperation.parameters)) {
    nextOperation.parameters = nextOperation.parameters.map(
      (parameter) => transformParameterDefinition(parameter, capabilities) as ParamSchema,
    );
  }

  if (nextOperation.requestBody) {
    nextOperation.requestBody = transformRequestBodyDefinition(
      nextOperation.requestBody,
      capabilities,
    ) as RouteDefinition["requestBody"];
  }

  if (nextOperation.responses) {
    nextOperation.responses = Object.fromEntries(
      Object.entries(nextOperation.responses).map(([status, response]) => [
        status,
        transformResponseDefinition(response, capabilities),
      ]),
    );
  }

  return nextOperation;
}

function transformParameterDefinition(
  parameter: unknown,
  capabilities: OpenApiVersionCapabilities,
) {
  if (!isRecord(parameter)) {
    return parameter;
  }

  const nextParameter = structuredClone(parameter) as ParamSchema;

  if (nextParameter.schema) {
    nextParameter.schema = transformSchema(nextParameter.schema, capabilities);
  }

  if (nextParameter.content) {
    nextParameter.content = Object.fromEntries(
      Object.entries(nextParameter.content).map(([mediaType, definition]) => [
        mediaType,
        transformMediaTypeDefinition(definition, capabilities, mediaType),
      ]),
    );
  }

  if (nextParameter.examples) {
    nextParameter.examples = transformExampleMap(nextParameter.examples, capabilities);
  }

  if (nextParameter.in === "querystring" && !capabilities.supportsQuerystring) {
    nextParameter.in = "query";
  }

  return nextParameter;
}

function transformRequestBodyDefinition(
  requestBody: unknown,
  capabilities: OpenApiVersionCapabilities,
) {
  if (!isRecord(requestBody)) {
    return requestBody;
  }

  if ("$ref" in requestBody && !("content" in requestBody)) {
    return structuredClone(requestBody);
  }

  const nextRequestBody = structuredClone(requestBody) as OpenApiRequestBody;
  if (nextRequestBody.content) {
    nextRequestBody.content = Object.fromEntries(
      Object.entries(nextRequestBody.content).map(([mediaType, definition]) => [
        mediaType,
        transformMediaTypeDefinition(definition, capabilities, mediaType),
      ]),
    );
  }

  return nextRequestBody;
}

function transformResponseDefinition(
  response: OpenApiResponseDefinition,
  capabilities: OpenApiVersionCapabilities,
): OpenApiResponseDefinition {
  if (!isRecord(response)) {
    return response;
  }

  if ("$ref" in response && !("description" in response)) {
    return transformSchema(response, capabilities);
  }

  const nextResponse = structuredClone(response);
  if ("content" in nextResponse && nextResponse.content && isRecord(nextResponse.content)) {
    nextResponse.content = Object.fromEntries(
      Object.entries(nextResponse.content).map(([mediaType, definition]) => [
        mediaType,
        transformMediaTypeDefinition(definition, capabilities, mediaType),
      ]),
    );
  }

  return nextResponse as OpenApiResponseDefinition;
}

function transformMediaTypeDefinition(
  mediaTypeDefinition: OpenApiMediaTypeDefinition,
  capabilities: OpenApiVersionCapabilities,
  mediaTypeName: string,
): OpenApiMediaTypeDefinition {
  const nextMediaType = structuredClone(mediaTypeDefinition);

  if (nextMediaType.schema) {
    nextMediaType.schema = transformSchema(nextMediaType.schema, capabilities, mediaTypeName);
  }

  if (nextMediaType.itemSchema) {
    if (capabilities.supportsSequentialMedia) {
      nextMediaType.itemSchema = transformSchema(
        nextMediaType.itemSchema,
        capabilities,
        mediaTypeName,
      );
    } else {
      delete nextMediaType.itemSchema;
    }
  }

  if (!capabilities.supportsSequentialMedia) {
    delete nextMediaType.itemEncoding;
    delete nextMediaType.prefixEncoding;
  }

  if (nextMediaType.examples) {
    nextMediaType.examples = transformExampleMap(nextMediaType.examples, capabilities);
  }

  return nextMediaType;
}

function transformSecurityScheme(scheme: unknown, capabilities: OpenApiVersionCapabilities) {
  if (!isRecord(scheme)) {
    return scheme;
  }

  const nextScheme = structuredClone(scheme);
  if (!capabilities.supportsOauthMetadata) {
    delete nextScheme.oauth2MetadataUrl;
  }

  if (
    !capabilities.supportsDeviceAuthorization &&
    isRecord(nextScheme.flows) &&
    "deviceAuthorization" in nextScheme.flows
  ) {
    delete nextScheme.flows.deviceAuthorization;
  }

  return nextScheme;
}

function transformTagDefinition(tag: unknown, capabilities: OpenApiVersionCapabilities) {
  if (!isRecord(tag) || capabilities.supportsEnhancedTags) {
    return tag;
  }

  const nextTag = structuredClone(tag);
  delete nextTag.summary;
  delete nextTag.parent;
  delete nextTag.kind;
  return nextTag;
}

function transformExampleMap(
  examples: OpenApiExampleMap,
  capabilities: OpenApiVersionCapabilities,
): OpenApiExampleMap {
  const nextExamples = structuredClone(examples);

  if (capabilities.supportsRichExamples) {
    return nextExamples;
  }

  for (const example of Object.values(nextExamples)) {
    if (!isRecord(example)) {
      continue;
    }

    if (!("value" in example) && "dataValue" in example) {
      example.value = example.dataValue;
    }

    delete example.dataValue;
    delete example.serializedValue;
  }

  return nextExamples;
}

function transformSchema(
  schema: OpenApiSchema,
  capabilities: OpenApiVersionCapabilities,
  mediaTypeName?: string,
): OpenApiSchema {
  if (!isRecord(schema)) {
    return schema;
  }

  let nextSchema = structuredClone(schema);

  if (nextSchema.properties) {
    nextSchema.properties = Object.fromEntries(
      Object.entries(nextSchema.properties).map(([name, propertySchema]) => [
        name,
        transformSchema(propertySchema, capabilities, mediaTypeName),
      ]),
    );
  }

  if (nextSchema.items && isRecord(nextSchema.items)) {
    nextSchema.items = transformSchema(nextSchema.items, capabilities, mediaTypeName);
  }

  if (nextSchema.prefixItems) {
    nextSchema.prefixItems = nextSchema.prefixItems.map((itemSchema) =>
      transformSchema(itemSchema, capabilities, mediaTypeName),
    );
  }

  if (nextSchema.oneOf) {
    nextSchema.oneOf = nextSchema.oneOf.map((itemSchema) =>
      transformSchema(itemSchema, capabilities, mediaTypeName),
    );
  }

  if (nextSchema.anyOf) {
    nextSchema.anyOf = nextSchema.anyOf.map((itemSchema) =>
      transformSchema(itemSchema, capabilities, mediaTypeName),
    );
  }

  if (nextSchema.allOf) {
    nextSchema.allOf = nextSchema.allOf.map((itemSchema) =>
      transformSchema(itemSchema, capabilities, mediaTypeName),
    );
  }

  if (nextSchema.additionalProperties && isRecord(nextSchema.additionalProperties)) {
    nextSchema.additionalProperties = transformSchema(
      nextSchema.additionalProperties,
      capabilities,
      mediaTypeName,
    );
  }

  if (nextSchema.if && isRecord(nextSchema.if)) {
    nextSchema.if = transformSchema(nextSchema.if, capabilities, mediaTypeName);
  }

  const thenSchema = Reflect.get(nextSchema, "then");
  if (thenSchema && isRecord(thenSchema)) {
    Reflect.set(nextSchema, "then", transformSchema(thenSchema, capabilities, mediaTypeName));
  }

  if (nextSchema.else && isRecord(nextSchema.else)) {
    nextSchema.else = transformSchema(nextSchema.else, capabilities, mediaTypeName);
  }

  nextSchema = capabilities.supportsOpenApi31Schema
    ? upgradeSchemaForOpenApi31(nextSchema, mediaTypeName)
    : downgradeSchemaForOpenApi30(nextSchema, mediaTypeName);

  return nextSchema;
}

function upgradeSchemaForOpenApi31(schema: OpenApiSchema, mediaTypeName?: string): OpenApiSchema {
  let nextSchema = structuredClone(schema);

  if (nextSchema.nullable) {
    delete nextSchema.nullable;

    if (typeof nextSchema.type === "string") {
      nextSchema.type = [...new Set([nextSchema.type, "null"])];
    } else if (Array.isArray(nextSchema.type)) {
      nextSchema.type = [...new Set([...nextSchema.type, "null"])];
    } else {
      const baseSchema = structuredClone(nextSchema);
      delete baseSchema.nullable;
      nextSchema = {
        anyOf: [baseSchema, { type: "null" }],
      };
    }
  }

  if (typeof nextSchema.exclusiveMinimum === "boolean") {
    if (nextSchema.exclusiveMinimum && typeof nextSchema.minimum === "number") {
      nextSchema.exclusiveMinimum = nextSchema.minimum;
      delete nextSchema.minimum;
    } else {
      delete nextSchema.exclusiveMinimum;
    }
  }

  if (typeof nextSchema.exclusiveMaximum === "boolean") {
    if (nextSchema.exclusiveMaximum && typeof nextSchema.maximum === "number") {
      nextSchema.exclusiveMaximum = nextSchema.maximum;
      delete nextSchema.maximum;
    } else {
      delete nextSchema.exclusiveMaximum;
    }
  }

  if (typeof nextSchema.example !== "undefined" && typeof nextSchema.examples === "undefined") {
    nextSchema.examples = [nextSchema.example];
    delete nextSchema.example;
  }

  if (nextSchema.format === "base64") {
    nextSchema.contentEncoding ??= "base64";
    delete nextSchema.format;
  }

  if (nextSchema.format === "binary") {
    if (mediaTypeName?.startsWith("multipart/")) {
      nextSchema.contentMediaType ??= "application/octet-stream";
      delete nextSchema.format;
    } else if (mediaTypeName && mediaTypeName !== "application/json") {
      nextSchema.contentMediaType ??= mediaTypeName;
      delete nextSchema.format;
    } else {
      nextSchema.contentMediaType ??= "application/octet-stream";
      delete nextSchema.format;
    }
  }

  return nextSchema;
}

function downgradeSchemaForOpenApi30(schema: OpenApiSchema, mediaTypeName?: string): OpenApiSchema {
  let nextSchema = structuredClone(schema);

  if (Array.isArray(nextSchema.type) && nextSchema.type.includes("null")) {
    const nonNullTypes = nextSchema.type.filter((typeName) => typeName !== "null");
    if (nonNullTypes.length === 1 && typeof nonNullTypes[0] === "string") {
      nextSchema.type = nonNullTypes[0];
      nextSchema.nullable = true;
    }
  }

  if (nextSchema.anyOf?.length === 2) {
    const nullableBranch = nextSchema.anyOf.find((item) => item.type === "null");
    const baseBranch = nextSchema.anyOf.find((item) => item.type !== "null");
    if (nullableBranch && baseBranch) {
      nextSchema = {
        ...structuredClone(baseBranch),
        nullable: true,
      };
    }
  }

  if (typeof nextSchema.exclusiveMinimum === "number") {
    nextSchema.minimum = nextSchema.exclusiveMinimum;
    nextSchema.exclusiveMinimum = true;
  }

  if (typeof nextSchema.exclusiveMaximum === "number") {
    nextSchema.maximum = nextSchema.exclusiveMaximum;
    nextSchema.exclusiveMaximum = true;
  }

  if (Array.isArray(nextSchema.examples) && nextSchema.examples.length > 0) {
    nextSchema.example ??= nextSchema.examples[0];
    delete nextSchema.examples;
  }

  if (nextSchema.contentEncoding === "base64") {
    nextSchema.format ??= "base64";
  }

  if (nextSchema.contentMediaType && !nextSchema.format) {
    if (
      nextSchema.contentMediaType === "application/octet-stream" ||
      mediaTypeName?.startsWith("multipart/")
    ) {
      nextSchema.format = "binary";
    }
  }

  delete nextSchema.contentEncoding;
  delete nextSchema.contentMediaType;
  delete nextSchema.$schema;

  return nextSchema;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);
