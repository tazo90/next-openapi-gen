import type {
  ErrorDefinition,
  ErrorTemplateConfig,
  JsonValue,
  OpenApiDocument,
  OpenApiResponseDefinition,
  OpenApiSchemaLike,
} from "../shared/types.js";

const HTTP_STATUS_KEYWORDS: Record<string, number> = {
  bad: 400,
  invalid: 400,
  validation: 422,
  unauthorized: 401,
  auth: 401,
  forbidden: 403,
  permission: 403,
  not_found: 404,
  missing: 404,
  conflict: 409,
  duplicate: 409,
  rate_limit: 429,
  too_many: 429,
  server: 500,
  internal: 500,
};

export function processTemplateVariables(
  template: JsonValue,
  variables: Record<string, string>,
): OpenApiSchemaLike {
  let result = JSON.stringify(template);

  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  });

  return JSON.parse(result) as OpenApiSchemaLike;
}

export function guessHttpStatus(errorCode: string): number {
  const numericCode = parseInt(errorCode);
  if (numericCode >= 100 && numericCode < 600) {
    return numericCode;
  }

  for (const [key, status] of Object.entries(HTTP_STATUS_KEYWORDS)) {
    if (errorCode.toLowerCase().includes(key)) {
      return status;
    }
  }

  return 500;
}

export function createErrorResponseComponent(errorDef: ErrorDefinition): OpenApiResponseDefinition {
  return {
    description: errorDef.description,
    content: {
      "application/json": {
        schema: errorDef.schema,
      },
    },
  };
}

export function generateErrorResponsesFromConfig(
  document: OpenApiDocument,
  errorConfig: ErrorTemplateConfig,
): void {
  const { template, codes, variables: globalVars = {} } = errorConfig;
  const responses = document.components?.responses;
  if (!responses) {
    return;
  }

  Object.entries(codes).forEach(([errorCode, config]) => {
    const httpStatus = (config.httpStatus || guessHttpStatus(errorCode)).toString();
    const allVariables = {
      ...globalVars,
      ...config.variables,
      ERROR_CODE: errorCode,
      DESCRIPTION: config.description,
      HTTP_STATUS: httpStatus,
    };

    responses[httpStatus] = {
      description: config.description,
      content: {
        "application/json": {
          schema: processTemplateVariables(template, allVariables),
        },
      },
    };
  });
}
