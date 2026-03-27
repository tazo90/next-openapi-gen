import { describe, expect, it, vi } from "vitest";

import {
  createDefaultPathParamsSchema,
  createMultipleResponsesSchema,
  createRequestBodySchema,
  createRequestParamsSchema,
  createResponseSchema,
  getSchemaContent,
} from "@next-openapi-gen/schema/typescript/schema-content.js";

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
      expect.objectContaining({ name: "id", example: 123 }),
      expect.objectContaining({ name: "slug", example: "slug" }),
    ]);
    expect(createRequestParamsSchema({})).toEqual([]);
    expect(
      createRequestParamsSchema(
        {
          properties: {
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
                format: "binary",
                description: "Avatar file",
              },
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
    const findSchemaDefinition = vi.fn((schemaName: string) => {
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
      pathParams: { type: "object", title: "Path" },
      body: { type: "object", title: "Body" },
      responses: { type: "object", title: "Response" },
    });
    expect(findSchemaDefinition).toHaveBeenCalledWith("Query", "params");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Path", "pathParams");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Body", "body");
    expect(findSchemaDefinition).toHaveBeenCalledWith("Response", "response");
  });
});
