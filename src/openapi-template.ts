export default {
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
    auth: ["401"],
  },
  errorConfig: {
    template: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          example: false,
        },
        error: {
          type: "string",
          example: "{{ERROR_MESSAGE}}",
        },
      },
    },
    codes: {
      invalid: {
        description: "Bad request",
        httpStatus: 400,
        variables: {
          ERROR_MESSAGE: "Validation error",
        },
      },
      auth: {
        description: "Unauthorized",
        httpStatus: 401,
        variables: {
          ERROR_MESSAGE: "Unathorized",
        },
      },
      server_error: {
        description: "Internal server error",
        httpStatus: 500,
        variables: {
          ERROR_MESSAGE: "Something went wrong",
        },
      },
    },
  },
  apiDir: "./src/app/api",
  schemaDir: "./src",
  schemaType: "typescript", // or "zod"
  docsUrl: "api-docs",
  ui: "scalar",
  outputFile: "openapi.json",
  includeOpenApiRoutes: false,
};
