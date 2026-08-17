import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

import {
  createDefaultPathParamsSchema,
  createMultipleResponsesSchema,
  createRequestBodySchema,
  createRequestParamsSchema,
  createResponseSchema,
  getSchemaContent,
} from "@workspace/openapi-core/schema/typescript/schema-content.js";

describe("TypeScript schema content helpers", () => {
  it("creates response maps for refs and inline schemas", () => {
    expect(
      createMultipleResponsesSchema({
        401: "Unauthorized",
        422: {
          description: "Validation failed",
          schema: { type: "object" },
        },
      }),
    ).toEqual({
      401: { $ref: "#/components/responses/Unauthorized" },
      422: {
        description: "Validation failed",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    });
  });

  it("creates path params, request params, and request bodies", () => {
    expect(createDefaultPathParamsSchema(["id", "slug"])).toEqual([
      expect.objectContaining({ name: "id", schema: { type: "string" }, example: "123" }),
      expect.objectContaining({ name: "slug", example: "slug" }),
    ]);
    expect(createDefaultPathParamsSchema(["organizationId"])[0]).toMatchObject({
      name: "organizationId",
      schema: { type: "string" },
    });
    expect(createRequestParamsSchema({})).toEqual([]);
    expect(
      createRequestParamsSchema(
        {
          properties: {
            organizationId: {
              type: "string",
              format: "uuid",
              required: true,
            },
            teamId: {
              type: "string",
              description: "Team ID",
              required: true,
            },
          },
        },
        true,
      ),
    ).toEqual([
      {
        in: "path",
        name: "organizationId",
        schema: {
          type: "string",
          format: "uuid",
        },
        required: true,
        example: "123e4567-e89b-12d3-a456-426614174000",
      },
      {
        in: "path",
        name: "teamId",
        schema: {
          type: "string",
          description: "Team ID",
        },
        required: true,
        description: "Team ID",
        example: "123",
      },
    ]);
    expect(
      createRequestParamsSchema({
        properties: {
          provider: {
            $ref: "#/components/schemas/ProviderSchema",
          },
          next: {
            allOf: [{ $ref: "#/components/schemas/SafeRedirectPathSchema" }],
          },
          filter: {
            type: "object",
            properties: {
              status: {
                type: "string",
              },
            },
          },
          search: {
            type: "string",
            style: "form",
            explode: false,
            allowReserved: true,
          },
        },
        required: ["provider"],
      }),
    ).toEqual([
      {
        in: "query",
        name: "provider",
        schema: {
          $ref: "#/components/schemas/ProviderSchema",
        },
        required: true,
        example: "example",
      },
      {
        in: "query",
        name: "next",
        schema: {
          allOf: [{ $ref: "#/components/schemas/SafeRedirectPathSchema" }],
        },
        required: false,
        example: "example",
      },
      {
        in: "query",
        name: "filter",
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
            },
          },
        },
        required: false,
        style: "deepObject",
        explode: true,
        example: "example",
      },
      {
        in: "query",
        name: "search",
        schema: {
          type: "string",
        },
        required: false,
        style: "form",
        explode: false,
        allowReserved: true,
        example: "example",
      },
    ]);
    // Enum-constrained parameters must not document an example their own schema
    // rejects, so the synthesized value is the first allowed member.
    expect(
      createRequestParamsSchema({
        properties: {
          status: {
            type: "string",
            enum: ["in_progress", "completed", "failed"],
            description: "Filter by status",
          },
        },
      }),
    ).toEqual([
      {
        in: "query",
        name: "status",
        schema: {
          type: "string",
          enum: ["in_progress", "completed", "failed"],
          description: "Filter by status",
        },
        required: false,
        description: "Filter by status",
        example: "in_progress",
      },
    ]);
    // An explicit example still wins over the synthesized one.
    expect(
      createRequestParamsSchema({
        properties: {
          status: {
            type: "string",
            enum: ["in_progress", "completed"],
            example: "completed",
          },
        },
      })[0],
    ).toMatchObject({ example: "completed" });
    expect(createRequestBodySchema({ type: [] }).content).toBeDefined();
    expect(createRequestBodySchema({ type: ["null"] }).content).toBeDefined();
    expect(createRequestBodySchema({ type: ["string", "null"] }).content).toBeDefined();
    expect(createRequestBodySchema({}).content).toBeDefined();
    expect(createRequestBodySchema({ type: "string" })).toEqual({
      content: {
        "application/json": {
          schema: { type: "string" },
        },
      },
    });
    expect(
      createRequestBodySchema(
        {
          type: "object",
          properties: {
            avatarFile: {
              type: "object",
              description: "Avatar file",
            },
          },
        },
        "Upload",
        "multipart/form-data",
      ),
    ).toEqual({
      description: "Upload",
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              avatarFile: {
                type: "string",
                contentMediaType: "application/octet-stream",
                description: "Avatar file",
              },
            },
          },
          encoding: {
            avatarFile: {
              contentType: "application/octet-stream",
            },
          },
        },
      },
    });
  });

  it("creates fallback responses and resolves schema content with zod retries", () => {
    expect(createResponseSchema({ type: "object" })).toEqual({
      200: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    });

    const openapiDefinitions: Record<string, any> = {};
    const findSchemaDefinition = vi.fn<MockFn>((schemaName: string) => {
      openapiDefinitions[schemaName] = {
        type: "object",
        title: schemaName,
      };
      return openapiDefinitions[schemaName];
    });

    expect(
      getSchemaContent(
        {
          tag: { type: "string" },
          paramsType: "Query",
          querystringType: "AdvancedQuery",
          pathParamsType: "Path",
          bodyType: "Body[][]",
          responseType: "Response[]",
        },
        {
          openapiDefinitions,
          schemaTypes: ["zod"],
          findSchemaDefinition,
        },
      ),
    ).toEqual({
      tag: { type: "string" },
      params: { type: "object", title: "Query" },
      querystring: { type: "object", title: "AdvancedQuery" },
      pathParams: { type: "object", title: "Path" },
      body: { type: "object", title: "Body" },
      responses: { type: "object", title: "Response" },
    });
    expect(findSchemaDefinition).toHaveBeenCalledWith("Query", "params");
    expect(findSchemaDefinition).toHaveBeenCalledWith("AdvancedQuery", "params");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Path", "pathParams");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Body", "body");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Response", "response");
  });

  it("covers leftover response defaults, content params, and schema-content fallbacks", () => {
    expect(createMultipleResponsesSchema({ 200: {} }, "Default")).toEqual({
      200: {
        description: "Default",
        content: { "application/json": { schema: {} } },
      },
    });
    expect(
      createMultipleResponsesSchema({
        201: { schema: { type: "string" } },
      }),
    ).toEqual({
      201: {
        description: "Response",
        content: { "application/json": { schema: { type: "string" } } },
      },
    });

    const params = createRequestParamsSchema(
      {
        properties: {
          q: {
            in: "query",
            description: "Search",
            example: "abc",
            examples: { a: { value: "abc" } },
            content: { "application/json": { schema: { type: "string" } } },
          },
          filter: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          id: {
            type: ["string", "null"],
          },
        },
        required: ["q"],
      },
      false,
    );
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "q",
          in: "query",
          content: expect.any(Object),
          examples: expect.any(Object),
        }),
        expect.objectContaining({ name: "filter", style: "deepObject", explode: true }),
      ]),
    );

    expect(
      getSchemaContent(
        {
          tag: { type: "string" },
          paramsType: "MissingQuery",
          querystringType: "",
          pathParamsType: "MissingPath",
          bodyType: "",
          responseType: "",
        },
        {
          openapiDefinitions: {},
          schemaTypes: ["typescript"],
          findSchemaDefinition: () => ({}),
        },
      ),
    ).toMatchObject({
      params: {},
      pathParams: {},
      body: {},
      responses: {},
    });

    expect(
      getSchemaContent(
        {
          tag: { type: "string" },
          paramsType: "",
          querystringType: "MissingQuery",
          pathParamsType: "",
          bodyType: "MissingBody",
          responseType: "MissingResponse",
        },
        {
          openapiDefinitions: {},
          schemaTypes: ["typescript"],
          findSchemaDefinition: () => undefined,
        },
      ),
    ).toMatchObject({
      querystring: {},
      body: {},
      responses: {},
    });
  });
});
