import { createFormDataSchema, detectContentType, getExampleForParam } from "./helpers.js";
import type { OpenAPIDefinition, ParamSchema, SchemaType } from "../../shared/types.js";

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

  if (params.properties) {
    for (const [name, value] of Object.entries(params.properties)) {
      const param: ParamSchema = {
        in: isPathParam ? "path" : "query",
        name,
        schema: {
          type: value.type ?? "string",
        },
        required: isPathParam ? true : !!value.required,
      };

      if (value.enum) {
        param.schema.enum = value.enum;
      }

      if (value.description) {
        param.description = value.description;
        param.schema.description = value.description;
      }

      if (isPathParam) {
        param.example = getExampleForParam(name, value.type);
      }

      queryParams.push(param);
    }
  }

  return queryParams;
}

export function createRequestBodySchema(
  body: OpenAPIDefinition,
  description?: string,
  contentType?: string,
): any {
  const detectedContentType = detectContentType(body?.type || "", contentType);
  const schema = detectedContentType === "multipart/form-data" ? createFormDataSchema(body) : body;
  const requestBody: any = {
    content: {
      [detectedContentType]: {
        schema,
      },
    },
  };

  if (description) {
    requestBody.description = description;
  }

  return requestBody;
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
  { tag, paramsType, pathParamsType, bodyType, responseType }: GetSchemaContentOptions,
  context: GetSchemaContentContext,
): {
  tag: OpenAPIDefinition;
  params: OpenAPIDefinition;
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
  const baseResponseType = stripArrayNotation(responseType);

  if (paramsType && !context.openapiDefinitions[paramsType]) {
    context.findSchemaDefinition(paramsType, "params");
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
  const pathParams = pathParamsType ? context.openapiDefinitions[pathParamsType] || {} : {};
  const body = baseBodyType ? context.openapiDefinitions[baseBodyType] || {} : {};
  const responses = baseResponseType ? context.openapiDefinitions[baseResponseType] || {} : {};

  if (context.schemaTypes.includes("zod")) {
    for (const schemaName of [paramsType, pathParamsType, baseBodyType, baseResponseType]) {
      if (!schemaName) {
        continue;
      }

      if (!context.openapiDefinitions[schemaName]) {
        context.findSchemaDefinition(schemaName, "");
      }
    }
  }

  return {
    tag,
    params,
    pathParams,
    body,
    responses,
  };
}
