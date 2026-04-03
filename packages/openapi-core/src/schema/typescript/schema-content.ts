import {
  createFormDataSchema,
  createMultipartEncoding,
  detectContentType,
  getExampleForParam,
} from "./helpers.js";
import type {
  OpenAPIDefinition,
  OpenApiExampleMap,
  OpenApiRequestBody,
  OpenApiSchemaLike,
  ParamSchema,
  SchemaType,
} from "../../shared/types.js";

export function createMultipleResponsesSchema(
  responses: Record<string, any>,
  defaultDescription?: string,
): Record<string, any> {
  const result: Record<string, any> = {};

  Object.entries(responses).forEach(([code, response]) => {
    if (typeof response === "string") {
      result[code] = { $ref: `#/components/responses/${response}` };
    } else {
      result[code] = {
        description: response.description || defaultDescription || "Response",
        content: {
          "application/json": {
            schema: response.schema || response,
          },
        },
      };
    }
  });

  return result;
}

export function createDefaultPathParamsSchema(paramNames: string[]): ParamSchema[] {
  return paramNames.map((paramName) => {
    let type = "string";
    if (
      paramName === "id" ||
      paramName.endsWith("Id") ||
      paramName === "page" ||
      paramName === "limit" ||
      paramName === "size" ||
      paramName === "count"
    ) {
      type = "number";
    }

    return {
      name: paramName,
      in: "path",
      required: true,
      schema: {
        type,
      },
      example: getExampleForParam(paramName, type),
      description: `Path parameter: ${paramName}`,
    };
  });
}

export function createRequestParamsSchema(
  params: OpenAPIDefinition,
  isPathParam: boolean = false,
): ParamSchema[] {
  const queryParams: ParamSchema[] = [];
  const requiredProperties = new Set(Array.isArray(params.required) ? params.required : []);

  if (params.properties) {
    for (const [name, value] of Object.entries(params.properties)) {
      const param: ParamSchema = {
        in: typeof value.in === "string" ? value.in : isPathParam ? "path" : "query",
        name,
        required: isPathParam ? true : requiredProperties.has(name) || !!value.required,
      };

      if (value.content) {
        param.content = structuredClone(value.content) as Record<string, any>;
      } else {
        param.schema = createParameterSchema(value);
      }

      if (typeof value.style === "string") {
        param.style = value.style;
      }

      if (typeof value.explode === "boolean") {
        param.explode = value.explode;
      }

      if (typeof value.allowReserved === "boolean") {
        param.allowReserved = value.allowReserved;
      }

      if (value.description) {
        param.description = value.description;
        if (param.schema) {
          param.schema.description = value.description;
        }
      }

      if (
        param.in === "query" &&
        !param.content &&
        typeof param.style === "undefined" &&
        isDeepObjectCandidate(value)
      ) {
        param.style = "deepObject";
        param.explode = true;
      }

      if (isPathParam) {
        param.example = getExampleForParam(name, getPrimarySchemaType(value.type));
      } else if (typeof value.example !== "undefined") {
        param.example = value.example;
      }

      if (value.examples && typeof value.examples === "object" && !Array.isArray(value.examples)) {
        param.examples = structuredClone(value.examples) as ParamSchema["examples"];
      }

      queryParams.push(param);
    }
  }

  return queryParams;
}

function createParameterSchema(value: OpenApiSchemaLike): OpenApiSchemaLike {
  if (value.schema) {
    return structuredClone(value.schema) as OpenApiSchemaLike;
  }

  const schema = structuredClone(value) as OpenApiSchemaLike;
  delete schema.in;
  delete schema.name;
  delete schema.required;
  delete schema.example;
  delete schema.content;
  delete schema.style;
  delete schema.explode;
  delete schema.allowReserved;
  if (!hasSchemaKeywords(schema)) {
    schema.type = "string";
  }
  return schema;
}

function hasSchemaKeywords(schema: OpenApiSchemaLike): boolean {
  return [
    "$ref",
    "type",
    "properties",
    "items",
    "prefixItems",
    "allOf",
    "anyOf",
    "oneOf",
    "additionalProperties",
    "enum",
    "const",
    "format",
    "contentEncoding",
    "contentMediaType",
  ].some((key) => typeof schema[key] !== "undefined");
}

export function createRequestBodySchema(
  body: OpenAPIDefinition,
  description?: string,
  contentType?: string,
  examples?: OpenApiExampleMap,
): OpenApiRequestBody {
  const detectedContentType = detectContentType(getPrimarySchemaType(body?.type), contentType);
  const schema = detectedContentType === "multipart/form-data" ? createFormDataSchema(body) : body;
  const encoding =
    detectedContentType === "multipart/form-data" ? createMultipartEncoding(body) : undefined;
  const requestBody: OpenApiRequestBody = {
    content: {
      [detectedContentType]: {
        schema,
        ...(examples ? { examples } : {}),
        ...(encoding ? { encoding } : {}),
      },
    },
  };

  if (description) {
    requestBody.description = description;
  }

  return requestBody;
}

function isDeepObjectCandidate(value: OpenApiSchemaLike): boolean {
  if (value.type === "object") {
    return true;
  }

  if (value.properties || value.additionalProperties) {
    return true;
  }

  return false;
}

function getPrimarySchemaType(type: string | string[] | undefined): string {
  if (Array.isArray(type)) {
    return type.find((entry) => entry !== "null") || type[0] || "string";
  }

  return type || "string";
}

export function createResponseSchema(responses: OpenAPIDefinition, description?: string): any {
  return {
    200: {
      description: description || "Successful response",
      content: {
        "application/json": {
          schema: responses,
        },
      },
    },
  };
}

type GetSchemaContentOptions = {
  tag: OpenAPIDefinition;
  paramsType?: string;
  querystringType?: string;
  pathParamsType?: string;
  bodyType?: string;
  responseType?: string;
};

type GetSchemaContentContext = {
  openapiDefinitions: Record<string, OpenAPIDefinition>;
  schemaTypes: SchemaType[];
  findSchemaDefinition: (schemaName: string, contentType: string) => OpenAPIDefinition;
};

export function getSchemaContent(
  {
    tag,
    paramsType,
    querystringType,
    pathParamsType,
    bodyType,
    responseType,
  }: GetSchemaContentOptions,
  context: GetSchemaContentContext,
): {
  tag: OpenAPIDefinition;
  params: OpenAPIDefinition;
  querystring: OpenAPIDefinition;
  pathParams: OpenAPIDefinition;
  body: OpenAPIDefinition;
  responses: OpenAPIDefinition;
} {
  const stripArrayNotation = (typeName: string | undefined): string | undefined => {
    if (!typeName) {
      return typeName;
    }
    let baseType = typeName;
    while (baseType.endsWith("[]")) {
      baseType = baseType.slice(0, -2);
    }
    return baseType;
  };

  const baseBodyType = stripArrayNotation(bodyType);
  const baseQuerystringType = stripArrayNotation(querystringType);
  const baseResponseType = stripArrayNotation(responseType);

  if (paramsType && !context.openapiDefinitions[paramsType]) {
    context.findSchemaDefinition(paramsType, "params");
  }

  if (baseQuerystringType && !context.openapiDefinitions[baseQuerystringType]) {
    context.findSchemaDefinition(baseQuerystringType, "params");
  }

  if (pathParamsType && !context.openapiDefinitions[pathParamsType]) {
    context.findSchemaDefinition(pathParamsType, "pathParams");
  }

  if (baseBodyType && !context.openapiDefinitions[baseBodyType]) {
    context.findSchemaDefinition(baseBodyType, "body");
  }

  if (baseResponseType && !context.openapiDefinitions[baseResponseType]) {
    context.findSchemaDefinition(baseResponseType, "response");
  }

  const params = paramsType ? context.openapiDefinitions[paramsType] || {} : {};
  const querystring = baseQuerystringType
    ? context.openapiDefinitions[baseQuerystringType] || {}
    : {};
  const pathParams = pathParamsType ? context.openapiDefinitions[pathParamsType] || {} : {};
  const body = baseBodyType ? context.openapiDefinitions[baseBodyType] || {} : {};
  const responses = baseResponseType ? context.openapiDefinitions[baseResponseType] || {} : {};

  if (context.schemaTypes.includes("zod")) {
    if (paramsType && !context.openapiDefinitions[paramsType]) {
      context.findSchemaDefinition(paramsType, "params");
    }
    if (baseQuerystringType && !context.openapiDefinitions[baseQuerystringType]) {
      context.findSchemaDefinition(baseQuerystringType, "params");
    }
    if (pathParamsType && !context.openapiDefinitions[pathParamsType]) {
      context.findSchemaDefinition(pathParamsType, "pathParams");
    }
    if (baseBodyType && !context.openapiDefinitions[baseBodyType]) {
      context.findSchemaDefinition(baseBodyType, "body");
    }
    if (baseResponseType && !context.openapiDefinitions[baseResponseType]) {
      context.findSchemaDefinition(baseResponseType, "response");
    }
  }

  return {
    tag,
    params,
    querystring,
    pathParams,
    body,
    responses,
  };
}
