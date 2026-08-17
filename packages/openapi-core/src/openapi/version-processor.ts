import { cleanSpec } from "../shared/spec.js";
import type {
  OpenApiDocument,
  OpenApiExampleMap,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiReference,
  OpenApiRequestBody,
  OpenApiResponseOrReference,
  OpenApiSchema,
  OpenApiSecurityScheme,
  OpenApiTag,
  OpenApiVersion,
} from "../shared/types.js";
import { moveFieldToExtension, promoteExtensionField } from "./registries/index.js";

interface OpenApiVersionProcessor {
  readonly id: OpenApiVersion;
  readonly version: string;
  finalize(document: OpenApiDocument): OpenApiDocument;
}

type OpenApiVersionCapabilities = {
  readonly version: OpenApiVersion;
  readonly supportsJsonSchemaDialect: boolean;
  readonly supportsOpenApi31Schema: boolean;
  readonly supportsRichExamples: boolean;
  readonly supportsQuerystring: boolean;
  readonly supportsEnhancedTags: boolean;
  readonly supportsAdditionalOperations: boolean;
  readonly supportsQueryOperation: boolean;
  readonly supportsSequentialMedia: boolean;
  readonly supportsServerName: boolean;
  readonly supportsDocumentSelf: boolean;
  readonly supportsOauthMetadata: boolean;
  readonly supportsDeviceAuthorization: boolean;
  readonly supportsCallbacks: boolean;
  readonly supportsWebhooks: boolean;
  readonly supportsDiscriminatorDefaultMapping: boolean;
  readonly supportsContentEncoding: boolean;
  readonly supportsConstKeyword: boolean;
  readonly supportsMediaTypesComponent: boolean;
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
      moveFieldToExtension(nextDocument, "$self", this.capabilities.version);
    } else {
      promoteExtensionField(nextDocument, "$self", this.capabilities.version);
    }

    if (nextDocument.servers) {
      nextDocument.servers = nextDocument.servers.map((server) => {
        const nextServer = structuredClone(server);
        if (!this.capabilities.supportsServerName) {
          moveFieldToExtension(nextServer, "name", this.capabilities.version);
        } else {
          promoteExtensionField(nextServer, "name", this.capabilities.version);
        }
        return nextServer;
      });
    }

    if (nextDocument.info?.license && !this.capabilities.supportsOpenApi31Schema) {
      moveFieldToExtension(nextDocument.info.license, "identifier", this.capabilities.version);
    } else if (nextDocument.info?.license) {
      promoteExtensionField(nextDocument.info.license, "identifier", this.capabilities.version);
    }

    if (nextDocument.tags) {
      nextDocument.tags = nextDocument.tags.map(
        (tag) => transformTagDefinition(tag, this.capabilities) as OpenApiTag,
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
      nextDocument.components.parameters = mapObjectValues(
        nextDocument.components.parameters,
        (parameter) => transformParameterDefinition(parameter, this.capabilities),
      );
    }

    if (nextDocument.components?.requestBodies) {
      nextDocument.components.requestBodies = mapObjectValues(
        nextDocument.components.requestBodies,
        (requestBody) => transformRequestBodyDefinition(requestBody, this.capabilities),
      );
    }

    if (nextDocument.components?.securitySchemes) {
      nextDocument.components.securitySchemes = mapObjectValues(
        nextDocument.components.securitySchemes,
        (scheme) => transformSecurityScheme(scheme, this.capabilities),
      );
    }

    if (nextDocument.paths) {
      nextDocument.paths = transformPathCollection(nextDocument.paths, this.capabilities);
    }

    if (nextDocument.webhooks) {
      if (!this.capabilities.supportsWebhooks) {
        delete nextDocument.webhooks;
      } else {
        nextDocument.webhooks = mapObjectValues(nextDocument.webhooks, (definition) =>
          transformPathItem(definition, this.capabilities),
        );
      }
    }

    if (nextDocument.components) {
      if (
        !this.capabilities.supportsMediaTypesComponent &&
        (nextDocument.components as Record<string, unknown>).mediaTypes
      ) {
        delete (nextDocument.components as Record<string, unknown>).mediaTypes;
      }
    }

    return cleanSpec(nextDocument);
  }
}

const OPENAPI_VERSION_PROCESSORS: Record<OpenApiVersion, OpenApiVersionProcessor> = {
  "3.0": new DefaultOpenApiVersionProcessor("3.0", "3.0.0", {
    version: "3.0",
    supportsJsonSchemaDialect: false,
    supportsOpenApi31Schema: false,
    supportsRichExamples: false,
    supportsQuerystring: false,
    supportsEnhancedTags: false,
    supportsAdditionalOperations: false,
    supportsQueryOperation: false,
    supportsSequentialMedia: false,
    supportsServerName: false,
    supportsDocumentSelf: false,
    supportsOauthMetadata: false,
    supportsDeviceAuthorization: false,
    supportsCallbacks: true,
    supportsWebhooks: false,
    supportsDiscriminatorDefaultMapping: false,
    supportsContentEncoding: false,
    supportsConstKeyword: false,
    supportsMediaTypesComponent: false,
  }),
  "3.1": new DefaultOpenApiVersionProcessor("3.1", "3.1.0", {
    version: "3.1",
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: false,
    supportsQuerystring: false,
    supportsEnhancedTags: false,
    supportsAdditionalOperations: false,
    supportsQueryOperation: false,
    supportsSequentialMedia: false,
    supportsServerName: false,
    supportsDocumentSelf: false,
    supportsOauthMetadata: false,
    supportsDeviceAuthorization: false,
    supportsCallbacks: true,
    supportsWebhooks: true,
    supportsDiscriminatorDefaultMapping: false,
    supportsContentEncoding: true,
    supportsConstKeyword: true,
    supportsMediaTypesComponent: false,
  }),
  "3.2": new DefaultOpenApiVersionProcessor("3.2", "3.2.0", {
    version: "3.2",
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: true,
    supportsQuerystring: true,
    supportsEnhancedTags: true,
    supportsAdditionalOperations: true,
    supportsQueryOperation: true,
    supportsSequentialMedia: true,
    supportsServerName: true,
    supportsDocumentSelf: true,
    supportsOauthMetadata: true,
    supportsDeviceAuthorization: true,
    supportsCallbacks: true,
    supportsWebhooks: true,
    supportsDiscriminatorDefaultMapping: true,
    supportsContentEncoding: true,
    supportsConstKeyword: true,
    supportsMediaTypesComponent: true,
  }),
  // Experimental 3.2-compatible preview. Do not emit OpenAPI 3.3 or 4.0.
  "3.3-preview": new DefaultOpenApiVersionProcessor("3.3-preview", "3.3-preview", {
    version: "3.3-preview",
    supportsJsonSchemaDialect: true,
    supportsOpenApi31Schema: true,
    supportsRichExamples: true,
    supportsQuerystring: true,
    supportsEnhancedTags: true,
    supportsAdditionalOperations: true,
    supportsQueryOperation: true,
    supportsSequentialMedia: true,
    supportsServerName: true,
    supportsDocumentSelf: true,
    supportsOauthMetadata: true,
    supportsDeviceAuthorization: true,
    supportsCallbacks: true,
    supportsWebhooks: true,
    supportsDiscriminatorDefaultMapping: true,
    supportsContentEncoding: true,
    supportsConstKeyword: true,
    supportsMediaTypesComponent: true,
  }),
};

export function getOpenApiVersionProcessor(
  openapiVersion: OpenApiVersion,
): OpenApiVersionProcessor {
  return OPENAPI_VERSION_PROCESSORS[openapiVersion];
}

function transformPathCollection(
  paths: Record<string, OpenApiPathItem>,
  capabilities: OpenApiVersionCapabilities,
): Record<string, OpenApiPathItem> {
  return mapObjectValues(paths, (definition) => transformPathItem(definition, capabilities));
}

function transformPathItem(
  definition: unknown,
  capabilities: OpenApiVersionCapabilities,
): OpenApiPathItem {
  if (!isRecord(definition)) {
    return {};
  }

  const nextDefinition = structuredClone(definition);

  if (Array.isArray(nextDefinition.parameters)) {
    nextDefinition.parameters = nextDefinition.parameters.map((parameter) =>
      transformParameterDefinition(parameter, capabilities),
    );
  }

  if (isRecord(nextDefinition.additionalOperations)) {
    nextDefinition.additionalOperations = Object.fromEntries(
      Object.entries(nextDefinition.additionalOperations).map(([name, operation]) => [
        name,
        transformOperation(operation, capabilities),
      ]),
    );
  }

  if (nextDefinition.query) {
    nextDefinition.query = transformOperation(nextDefinition.query, capabilities);
  }

  promotePathItemOperations(nextDefinition, capabilities);

  if (!capabilities.supportsQueryOperation && nextDefinition.query) {
    const backported = isRecord(nextDefinition["x-oai-additionalOperations"])
      ? nextDefinition["x-oai-additionalOperations"]
      : {};
    backported.query = nextDefinition.query;
    nextDefinition["x-oai-additionalOperations"] = backported;
    delete nextDefinition.query;
  }

  if (!capabilities.supportsAdditionalOperations && isRecord(nextDefinition.additionalOperations)) {
    const backported = isRecord(nextDefinition["x-oai-additionalOperations"])
      ? nextDefinition["x-oai-additionalOperations"]
      : {};
    nextDefinition["x-oai-additionalOperations"] = {
      ...nextDefinition.additionalOperations,
      ...backported,
    };
    delete nextDefinition.additionalOperations;
  }

  for (const [method, operation] of Object.entries(nextDefinition)) {
    if (!HTTP_METHODS.has(method)) {
      continue;
    }

    nextDefinition[method] = transformOperation(operation, capabilities);
  }

  return nextDefinition;
}

function promotePathItemOperations(
  pathItem: Record<string, any>,
  capabilities: OpenApiVersionCapabilities,
): void {
  const backported = pathItem["x-oai-additionalOperations"];
  if (!isRecord(backported)) {
    return;
  }

  if (capabilities.supportsQueryOperation && backported.query && !pathItem.query) {
    pathItem.query = backported.query;
    delete backported.query;
  }

  if (capabilities.supportsAdditionalOperations) {
    const remaining = Object.fromEntries(
      Object.entries(backported).filter(([, operation]) => operation !== undefined),
    );
    if (Object.keys(remaining).length > 0) {
      pathItem.additionalOperations = {
        ...remaining,
        ...(isRecord(pathItem.additionalOperations) ? pathItem.additionalOperations : {}),
      };
    }
    delete pathItem["x-oai-additionalOperations"];
  }
}

function transformOperation(
  operation: unknown,
  capabilities: OpenApiVersionCapabilities,
): OpenApiOperation {
  if (!isRecord(operation)) {
    return {};
  }

  const nextOperation = structuredClone(operation) as OpenApiOperation;

  if (Array.isArray(nextOperation.parameters)) {
    nextOperation.parameters = nextOperation.parameters.map((parameter) =>
      transformParameterDefinition(parameter, capabilities),
    );
  }

  if (nextOperation.requestBody) {
    nextOperation.requestBody = transformRequestBodyDefinition(
      nextOperation.requestBody,
      capabilities,
    );
  }

  if (nextOperation.responses) {
    nextOperation.responses = Object.fromEntries(
      Object.entries(nextOperation.responses).map(([status, response]) => [
        status,
        transformResponseDefinition(response, capabilities),
      ]),
    );
  }

  if (nextOperation.callbacks && !capabilities.supportsCallbacks) {
    delete nextOperation.callbacks;
  }

  return nextOperation;
}

function transformParameterDefinition(
  parameter: unknown,
  capabilities: OpenApiVersionCapabilities,
): OpenApiParameter | OpenApiReference {
  if (!isRecord(parameter)) {
    return parameter as OpenApiParameter;
  }

  const nextParameter = structuredClone(parameter) as OpenApiParameter;

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
): OpenApiRequestBody | OpenApiReference {
  if (!isRecord(requestBody)) {
    return requestBody as OpenApiRequestBody;
  }

  if ("$ref" in requestBody && !("content" in requestBody)) {
    return structuredClone(requestBody) as OpenApiReference;
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
  response: OpenApiResponseOrReference,
  capabilities: OpenApiVersionCapabilities,
): OpenApiResponseOrReference {
  if (!isRecord(response)) {
    return response;
  }

  if ("$ref" in response && !("description" in response)) {
    return structuredClone(response);
  }

  const nextResponse = structuredClone(response) as Record<string, unknown>;
  if (!capabilities.supportsRichExamples) {
    moveFieldToExtension(nextResponse, "summary", capabilities.version);
  } else {
    promoteExtensionField(nextResponse, "summary", capabilities.version);
  }
  if (nextResponse.content && isRecord(nextResponse.content)) {
    nextResponse.content = Object.fromEntries(
      Object.entries(nextResponse.content).map(([mediaType, definition]) => [
        mediaType,
        transformMediaTypeDefinition(definition, capabilities, mediaType),
      ]),
    );
  }

  return nextResponse as OpenApiResponseOrReference;
}

function transformMediaTypeDefinition(
  mediaTypeDefinition: OpenApiMediaType | unknown,
  capabilities: OpenApiVersionCapabilities,
  mediaTypeName: string,
): OpenApiMediaType {
  if (
    !isRecord(mediaTypeDefinition) ||
    ("$ref" in mediaTypeDefinition && !("schema" in mediaTypeDefinition))
  ) {
    return mediaTypeDefinition as OpenApiMediaType;
  }

  const nextMediaType = structuredClone(mediaTypeDefinition) as OpenApiMediaType;

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
      promoteExtensionField(nextMediaType, "itemSchema", capabilities.version);
    } else {
      moveFieldToExtension(nextMediaType, "itemSchema", capabilities.version);
    }
  }

  if (!capabilities.supportsSequentialMedia) {
    moveFieldToExtension(nextMediaType, "itemEncoding", capabilities.version);
    moveFieldToExtension(nextMediaType, "prefixEncoding", capabilities.version);
  } else {
    promoteExtensionField(nextMediaType, "itemEncoding", capabilities.version);
    promoteExtensionField(nextMediaType, "prefixEncoding", capabilities.version);
  }

  if (nextMediaType.examples) {
    nextMediaType.examples = transformExampleMap(nextMediaType.examples, capabilities);
  }

  return nextMediaType;
}

function transformSecurityScheme(
  scheme: unknown,
  capabilities: OpenApiVersionCapabilities,
): OpenApiSecurityScheme | OpenApiReference {
  if (!isRecord(scheme)) {
    return scheme as OpenApiSecurityScheme;
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
    moveFieldToExtension(nextScheme.flows, "deviceAuthorization", capabilities.version);
  } else if (isRecord(nextScheme.flows)) {
    promoteExtensionField(nextScheme.flows, "deviceAuthorization", capabilities.version);
  }

  if ("deprecated" in nextScheme && !capabilities.supportsDocumentSelf) {
    moveFieldToExtension(nextScheme, "deprecated", capabilities.version);
  }

  return nextScheme as OpenApiSecurityScheme;
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
    for (const example of Object.values(nextExamples)) {
      if (!isRecord(example) || "$ref" in example) {
        continue;
      }
      promoteExtensionField(example, "dataValue", capabilities.version);
      promoteExtensionField(example, "serializedValue", capabilities.version);
    }
    return nextExamples;
  }

  for (const example of Object.values(nextExamples)) {
    if (!isRecord(example)) {
      continue;
    }

    if (!("value" in example) && "dataValue" in example && !("$ref" in example)) {
      example.value = example.dataValue;
    }

    if (!("$ref" in example)) {
      moveFieldToExtension(example, "dataValue", capabilities.version);
      moveFieldToExtension(example, "serializedValue", capabilities.version);
    }
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

  if (
    !capabilities.supportsDiscriminatorDefaultMapping &&
    nextSchema.discriminator &&
    nextSchema.discriminator.defaultMapping
  ) {
    const nextDiscriminator = { ...nextSchema.discriminator };
    delete nextDiscriminator.defaultMapping;
    nextSchema.discriminator = nextDiscriminator;
  }

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

  if (typeof nextSchema.const !== "undefined") {
    nextSchema.enum = [nextSchema.const as string | number | boolean | null];
    delete nextSchema.const;
  }

  if (nextSchema.discriminator && nextSchema.discriminator.defaultMapping) {
    const nextDiscriminator = { ...nextSchema.discriminator };
    delete nextDiscriminator.defaultMapping;
    nextSchema.discriminator = nextDiscriminator;
  }

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
      const { anyOf: _anyOf, ...outerMeta } = nextSchema;
      nextSchema = {
        ...structuredClone(baseBranch),
        ...outerMeta,
        nullable: true,
      };
    }
  }

  if (typeof nextSchema.exclusiveMinimum === "number") {
    if (
      typeof nextSchema.minimum !== "number" ||
      nextSchema.exclusiveMinimum >= nextSchema.minimum
    ) {
      nextSchema.minimum = nextSchema.exclusiveMinimum;
      nextSchema.exclusiveMinimum = true;
    } else {
      delete nextSchema.exclusiveMinimum;
    }
  }

  if (typeof nextSchema.exclusiveMaximum === "number") {
    if (
      typeof nextSchema.maximum !== "number" ||
      nextSchema.exclusiveMaximum <= nextSchema.maximum
    ) {
      nextSchema.maximum = nextSchema.exclusiveMaximum;
      nextSchema.exclusiveMaximum = true;
    } else {
      delete nextSchema.exclusiveMaximum;
    }
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

  moveFieldToExtension(nextSchema, "contentEncoding", "3.0");
  moveFieldToExtension(nextSchema, "contentMediaType", "3.0");
  delete nextSchema.$schema;

  if (Array.isArray(nextSchema.prefixItems) && nextSchema.prefixItems.length > 0) {
    const prefixItems = nextSchema.prefixItems;
    const restItems = isRecord(nextSchema.items) ? nextSchema.items : null;

    nextSchema.items =
      restItems || prefixItems.length > 1
        ? { oneOf: [...prefixItems, ...(restItems ? [restItems] : [])] }
        : prefixItems[0];
    delete nextSchema.prefixItems;
  }

  // OpenAPI 3.0 does not support several JSON Schema 2020-12 keywords natively.
  // Registered OAI extensions keep the data; unregistered keywords are dropped.
  const unsupportedOpenApi30Keywords: readonly string[] = [
    "propertyNames",
    "dependentSchemas",
    "dependentRequired",
    "unevaluatedProperties",
    "unevaluatedItems",
    "patternProperties",
    "contentSchema",
    "prefixItems",
    "$defs",
    "if",
    "then",
    "else",
  ];
  for (const keyword of unsupportedOpenApi30Keywords) {
    if (keyword in nextSchema) {
      moveFieldToExtension(nextSchema, keyword, "3.0");
      if (keyword in nextSchema) {
        delete (nextSchema as Record<string, unknown>)[keyword];
      }
    }
  }

  return nextSchema;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapObjectValues<T, U>(
  record: Record<string, T>,
  map: (value: T, key: string) => U,
): Record<string, U> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value, key)]));
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
