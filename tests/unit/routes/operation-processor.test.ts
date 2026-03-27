import { describe, expect, it, vi } from "vitest";

import { OperationProcessor } from "@next-openapi-gen/routes/operation-processor.js";

describe("OperationProcessor", () => {
  it("builds operation metadata, auth, parameters, request bodies, and responses", () => {
    const adapter = {
      getRoutePath: vi.fn(() => "/users/{id}"),
    };
    const schemaProcessor = {
      getSchemaContent: vi
        .fn()
        .mockReturnValueOnce({
          params: "UserQuery",
          pathParams: undefined,
          body: undefined,
          responses: undefined,
        })
        .mockReturnValueOnce({}),
      createRequestParamsSchema: vi
        .fn()
        .mockReturnValueOnce([{ name: "limit", in: "query", schema: { type: "number" } }]),
      createDefaultPathParamsSchema: vi
        .fn()
        .mockReturnValue([{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      detectContentType: vi.fn(() => "application/json"),
      createRequestBodySchema: vi.fn(),
      createResponseSchema: vi.fn(),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn(() => true),
      processResponses: vi.fn(() => ({
        201: {
          description: "Created",
        },
      })),
    };

    const processor = new OperationProcessor(
      adapter as never,
      schemaProcessor as never,
      responseProcessor as never,
    );

    const result = processor.processOperation("POST", "./src/app/api/users/[id]/route.ts", {
      operationId: "createUser",
      tag: "Users",
      summary: "Create user",
      description: "Creates a user",
      auth: "BearerAuth,ApiKeyAuth",
      deprecated: true,
      bodyType: "CreateUserBody",
      bodyDescription: "Payload",
      contentType: "application/json",
    });

    expect(result.routePath).toBe("/users/{id}");
    expect(result.method).toBe("post");
    expect(result.definition).toMatchObject({
      operationId: "createUser",
      summary: "Create user",
      description: "Creates a user",
      tags: ["Users"],
      deprecated: true,
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      responses: {
        201: {
          description: "Created",
        },
      },
    });
    expect(result.definition.parameters).toEqual([
      { name: "limit", in: "query", schema: { type: "number" } },
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(result.definition.requestBody).toEqual({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateUserBody" },
        },
      },
      description: "Payload",
    });
  });

  it("falls back to generated tags, explicit path params schemas, and schema response creation", () => {
    const adapter = {
      getRoutePath: vi.fn(() => "/reports"),
    };
    const schemaProcessor = {
      getSchemaContent: vi.fn(() => ({
        params: undefined,
        pathParams: "ReportPathParams",
        body: {
          type: "object",
        },
        responses: {
          type: "object",
        },
      })),
      createRequestParamsSchema: vi.fn(() => [{ name: "teamId", in: "path" }]),
      createDefaultPathParamsSchema: vi.fn(),
      detectContentType: vi.fn(),
      createRequestBodySchema: vi.fn(() => ({ description: "Body schema" })),
      createResponseSchema: vi.fn(() => ({
        200: { description: "Generated response" },
      })),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn(() => true),
      processResponses: vi.fn(() => ({})),
    };

    const processor = new OperationProcessor(
      adapter as never,
      schemaProcessor as never,
      responseProcessor as never,
    );

    const result = processor.processOperation("PUT", "./src/app/api/reports/route.ts", {
      bodyDescription: "Updated report",
    });

    expect(result.definition.operationId).toBe("put-reports");
    expect(result.definition.tags).toEqual(["Reports"]);
    expect(result.definition.parameters).toEqual([{ name: "teamId", in: "path" }]);
    expect(result.definition.requestBody).toEqual({ description: "Body schema" });
    expect(result.definition.responses).toEqual({
      200: { description: "Generated response" },
    });
  });
});
