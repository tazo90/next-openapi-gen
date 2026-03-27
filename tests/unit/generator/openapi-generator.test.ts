import fs from "node:fs";
import path from "node:path";

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
        const performanceProfile = generator.getPerformanceProfile();

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
        expect(performanceProfile).toMatchObject({
          prepareDocumentMs: expect.any(Number),
          scanRoutesMs: expect.any(Number),
          buildPathsMs: expect.any(Number),
          mergeSchemasMs: expect.any(Number),
          finalizeDocumentMs: expect.any(Number),
          totalMs: expect.any(Number),
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

  it("merges reusable OpenAPI fragments from schemaFiles", () => {
    const project = createTempProject("nxog-generator-custom-fragments-");

    try {
      const schemaFilePath = path.join(project.root, "schemas", "fragments.yaml");
      fs.mkdirSync(path.dirname(schemaFilePath), { recursive: true });
      fs.writeFileSync(
        schemaFilePath,
        `tags:
  - name: events
    summary: Events
    kind: nav
servers:
  - url: https://api.example.com
    description: Production
    name: production
paths:
  /stream:
    get:
      operationId: get-stream
      tags: [events]
      responses:
        "200":
          description: Event stream
          content:
            text/event-stream:
              itemSchema:
                type: object
                properties:
                  id:
                    type: string
components:
  parameters:
    StreamQuery:
      name: advancedQuery
      in: querystring
      content:
        application/x-www-form-urlencoded:
          schema:
            type: object
            properties:
              q:
                type: string
  requestBodies:
    StreamBody:
      description: Stream filter body
      content:
        application/json:
          schema:
            type: object
            properties:
              cursor:
                type: string
  schemas:
    ExternalEvent:
      type: object
      properties:
        id:
          type: string
  securitySchemes:
    DeviceOAuth:
      type: oauth2
      oauth2MetadataUrl: https://example.com/.well-known/oauth-authorization-server
      flows:
        deviceAuthorization:
          deviceAuthorizationUrl: https://example.com/oauth/device
          tokenUrl: https://example.com/oauth/token
          scopes:
            read_events: Read events
`,
      );

      const templatePath = writeOpenApiTemplate(project.root, {
        openapi: "3.2.0",
        schemaFiles: ["./schemas/fragments.yaml"],
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.tags).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "events", summary: "Events" })]),
        );
        expect(spec.servers).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "production" })]),
        );
        expect(spec.paths?.["/stream"]?.get?.responses?.["200"]).toMatchObject({
          content: {
            "text/event-stream": {
              itemSchema: {
                type: "object",
              },
            },
          },
        });
        expect(spec.components?.parameters?.StreamQuery).toMatchObject({
          in: "querystring",
        });
        expect(spec.components?.requestBodies?.StreamBody).toMatchObject({
          description: "Stream filter body",
        });
        expect(spec.components?.schemas?.ExternalEvent).toMatchObject({
          type: "object",
        });
        expect(spec.components?.securitySchemes?.DeviceOAuth).toMatchObject({
          oauth2MetadataUrl: "https://example.com/.well-known/oauth-authorization-server",
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });

  it("preserves explicit servers when they already exist", () => {
    const project = createTempProject("nxog-generator-explicit-servers-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        basePath: "/api",
        servers: [
          {
            url: "https://example.com",
            description: "Primary",
          },
        ],
      });
      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.servers).toEqual([
          {
            url: "https://example.com",
            description: "Primary",
          },
        ]);
      } finally {
        process.chdir(previousCwd);
      }
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
