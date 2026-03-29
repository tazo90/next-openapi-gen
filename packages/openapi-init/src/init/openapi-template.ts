import {
  DEFAULT_DEBUG,
  DEFAULT_DIAGNOSTICS_ENABLED,
  DEFAULT_DOCS_URL,
  DEFAULT_GENERATED_OPENAPI_FILENAME,
  DEFAULT_INIT_SCHEMA_TYPE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_UI,
} from "@workspace/openapi-core/config/defaults.js";
import type { OpenApiTemplate } from "@workspace/openapi-core/shared/types.js";

import { getInitFrameworkTemplateOverrides, type InitFramework } from "./framework.js";

const baseOpenApiTemplate = {
  openapi: "3.0.0",
  info: {
    title: "API Documentation",
    version: "1.0.0",
    description: "This is the OpenAPI specification for your project.",
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Local development server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  defaultResponseSet: "common",
  responseSets: {
    common: ["400", "500"],
    auth: ["400", "401", "403", "500"],
    public: ["400", "500"],
  },
  errorConfig: {
    template: {
      type: "object",
      properties: {
        error: {
          type: "string",
          example: "{{ERROR_MESSAGE}}",
        },
        code: {
          type: "string",
          example: "{{ERROR_CODE}}",
        },
      },
    },
    codes: {
      "400": {
        description: "Bad Request",
        variables: {
          ERROR_MESSAGE: "Invalid request parameters",
          ERROR_CODE: "BAD_REQUEST",
        },
      },
      "401": {
        description: "Unauthorized",
        variables: {
          ERROR_MESSAGE: "Authentication required",
          ERROR_CODE: "UNAUTHORIZED",
        },
      },
      "403": {
        description: "Forbidden",
        variables: {
          ERROR_MESSAGE: "Access denied",
          ERROR_CODE: "FORBIDDEN",
        },
      },
      "404": {
        description: "Not Found",
        variables: {
          ERROR_MESSAGE: "Resource not found",
          ERROR_CODE: "NOT_FOUND",
        },
      },
      "409": {
        description: "Conflict",
        variables: {
          ERROR_MESSAGE: "Resource already exists",
          ERROR_CODE: "CONFLICT",
        },
      },
      "500": {
        description: "Internal Server Error",
        variables: {
          ERROR_MESSAGE: "An unexpected error occurred",
          ERROR_CODE: "INTERNAL_ERROR",
        },
      },
    },
  },
  schemaType: DEFAULT_INIT_SCHEMA_TYPE, // or "typescript" or ["zod", "typescript"]
  schemaFiles: [], // Optional: ["./openapi-models.yaml", "./schemas.json"]
  docsUrl: DEFAULT_DOCS_URL,
  ui: DEFAULT_UI,
  outputFile: DEFAULT_GENERATED_OPENAPI_FILENAME,
  outputDir: DEFAULT_OUTPUT_DIR,
  diagnostics: {
    enabled: DEFAULT_DIAGNOSTICS_ENABLED,
  },
  ignoreRoutes: [],
  debug: DEFAULT_DEBUG,
} satisfies OpenApiTemplate;

export function createOpenApiTemplate(framework: InitFramework = "next"): OpenApiTemplate {
  return {
    ...baseOpenApiTemplate,
    ...getInitFrameworkTemplateOverrides(framework),
  };
}

const openapiTemplate = createOpenApiTemplate();

export default openapiTemplate;
