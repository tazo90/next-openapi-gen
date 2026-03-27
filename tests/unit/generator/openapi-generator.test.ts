import { describe, expect, it } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";

import { createTempProject, writeOpenApiTemplate } from "../../helpers/test-project.js";

describe("OpenApiGenerator", () => {
  it("applies config defaults from a minimal template", () => {
    const project = createTempProject("nxog-generator-defaults-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        apiDir: undefined,
        schemaDir: undefined,
        docsUrl: undefined,
        ui: undefined,
        outputFile: undefined,
        outputDir: undefined,
        includeOpenApiRoutes: undefined,
        ignoreRoutes: undefined,
        schemaType: undefined,
        debug: undefined,
      });

      const generator = new OpenApiGenerator({ templatePath });

      expect(generator.getConfig()).toMatchObject({
        apiDir: "./src/app/api",
        routerType: "app",
        schemaDir: "./src",
        docsUrl: "api-docs",
        ui: "scalar",
        outputFile: "openapi.json",
        outputDir: "./public",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        schemaType: "typescript",
        schemaFiles: [],
        debug: false,
      });
    } finally {
      project.cleanup();
    }
  });

  it("builds default servers and error responses from template config", () => {
    const project = createTempProject("nxog-generator-errors-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        basePath: "/api",
        servers: [],
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
              status: {
                type: "integer",
                example: "{{HTTP_STATUS}}",
              },
            },
          },
          codes: {
            AUTH_EXPIRED: {
              description: "Authentication expired",
              variables: {
                ERROR_MESSAGE: "Please sign in again",
              },
            },
          },
          variables: {
            ERROR_CODE: "GENERIC_ERROR",
          },
        },
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.servers).toEqual([
          {
            url: "/api",
            description: "API server",
          },
        ]);
        expect(spec.components?.responses?.["401"]).toEqual({
          description: "Authentication expired",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: {
                    type: "string",
                    example: "Please sign in again",
                  },
                  code: {
                    type: "string",
                    example: "AUTH_EXPIRED",
                  },
                  status: {
                    type: "integer",
                    example: "401",
                  },
                },
              },
            },
          },
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });

  it("keeps existing component schemas and responses intact when no routes are found", () => {
    const project = createTempProject("nxog-generator-components-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        components: {
          schemas: {
            ExistingSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
              },
            },
          },
          responses: {
            "418": {
              description: "Teapot",
            },
          },
        },
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.components?.schemas).toHaveProperty("ExistingSchema");
        expect(spec.components?.responses?.["418"]).toEqual({
          description: "Teapot",
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });

  it("covers private error helper branches", () => {
    const project = createTempProject("nxog-generator-private-");

    try {
      const templatePath = writeOpenApiTemplate(project.root);
      const generator = new OpenApiGenerator({ templatePath });

      expect((generator as any).guessHttpStatus("418")).toBe(418);
      expect((generator as any).guessHttpStatus("permission_denied")).toBe(403);
      expect((generator as any).guessHttpStatus("mystery_error")).toBe(500);

      expect(
        (generator as any).processTemplate(
          {
            message: "{{MESSAGE}}",
            code: "{{CODE}}",
          },
          {
            MESSAGE: "Created",
            CODE: "USER_CREATED",
          },
        ),
      ).toEqual({
        message: "Created",
        code: "USER_CREATED",
      });

      expect(
        (generator as any).createErrorResponseComponent("401", {
          description: "Unauthorized",
          schema: { type: "object" },
        }),
      ).toEqual({
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      });

      expect(() =>
        (generator as any).generateErrorResponsesFromConfig(
          {
            components: {},
          },
          {
            template: {},
            codes: {},
          },
        ),
      ).not.toThrow();
    } finally {
      project.cleanup();
    }
  });

  it("builds manual error response components from errorDefinitions", () => {
    const project = createTempProject("nxog-generator-manual-errors-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        errorConfig: undefined,
        errorDefinitions: {
          conflict: {
            description: "Conflict happened",
            schema: {
              type: "object",
              properties: {
                code: { type: "string" },
              },
            },
          },
        },
      });
      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.components?.responses?.conflict).toEqual({
          description: "Conflict happened",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  code: { type: "string" },
                },
              },
            },
          },
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});
