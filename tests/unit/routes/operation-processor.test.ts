import { describe, expect, it, vi } from "vitest";

import { OperationProcessor } from "@next-openapi-gen/routes/operation-processor.js";

describe("OperationProcessor", () => {
  it("builds mutation operations with auth, path params, and referenced request bodies", () => {
    const schemaProcessor = {
      getSchemaContent: vi
        .fn()
        .mockReturnValueOnce({
          params: { properties: { search: { type: "string", required: true } } },
          pathParams: {},
          body: {},
          responses: {},
        })
        .mockReturnValueOnce({}),
      createRequestParamsSchema: vi
        .fn()
        .mockReturnValueOnce([
          { in: "query", name: "search", required: true, schema: { type: "string" } },
        ])
        .mockReturnValueOnce([
          { in: "path", name: "id", required: true, schema: { type: "string" } },
        ]),
      createDefaultPathParamsSchema: vi.fn(),
      detectContentType: vi.fn(() => "multipart/form-data"),
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

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation(
      "POST",
      "/users/{id}",
      {
        auth: "BearerAuth,ApiKeyAuth",
        deprecated: true,
        summary: "Create user",
        description: "Creates a user",
        bodyType: "UploadBody",
        bodyDescription: "Upload payload",
        contentType: "multipart/form-data",
      },
      ["id"],
    );

    expect(result).toEqual({
      routePath: "/users/{id}",
      method: "post",
      definition: {
        operationId: "post-users-{id}",
        summary: "Create user",
        description: "Creates a user",
        deprecated: true,
        tags: ["Users"],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { in: "query", name: "search", required: true, schema: { type: "string" } },
          { in: "path", name: "id", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          description: "Upload payload",
          content: {
            "multipart/form-data": {
              schema: { $ref: "#/components/schemas/UploadBody" },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
          },
        },
      },
    });
    expect(schemaProcessor.detectContentType).toHaveBeenCalledWith(
      "UploadBody",
      "multipart/form-data",
    );
  });

  it("uses explicit path params and falls back to generated responses for root routes", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn().mockReturnValue({
        params: undefined,
        pathParams: { properties: { slug: { type: "string", required: true } } },
        body: { type: "object", properties: { name: { type: "string" } } },
        responses: { type: "object", properties: { ok: { type: "boolean" } } },
      }),
      createRequestParamsSchema: vi.fn(() => [
        { in: "path", name: "slug", required: true, schema: { type: "string" } },
      ]),
      createDefaultPathParamsSchema: vi.fn(),
      detectContentType: vi.fn(),
      createRequestBodySchema: vi.fn(() => ({
        description: "Body",
      })),
      createResponseSchema: vi.fn(() => ({
        200: {
          description: "Fallback",
        },
      })),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn(() => false),
      processResponses: vi.fn(() => ({})),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation("GET", "/", {
      tag: "",
      pathParamsType: "RootPathParams",
      responseDescription: "Fallback",
    });

    expect(result).toEqual({
      routePath: "/",
      method: "get",
      definition: {
        operationId: "get-",
        summary: undefined,
        description: undefined,
        tags: [""],
        parameters: [{ in: "path", name: "slug", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Fallback",
          },
        },
      },
    });
    expect(schemaProcessor.createDefaultPathParamsSchema).not.toHaveBeenCalled();
    expect(schemaProcessor.createResponseSchema).toHaveBeenCalledWith(
      { type: "object", properties: { ok: { type: "boolean" } } },
      "Fallback",
    );
  });
});
describe("OperationProcessor", () => {
  it("builds operation metadata, auth, parameters, request bodies, and responses", () => {
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

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation(
      "POST",
      "/users/{id}",
      {
        operationId: "createUser",
        tag: "Users",
        summary: "Create user",
        description: "Creates a user",
        auth: "BearerAuth,ApiKeyAuth",
        deprecated: true,
        bodyType: "CreateUserBody",
        bodyDescription: "Payload",
        contentType: "application/json",
      },
      ["id"],
    );

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

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation("PUT", "/reports", {
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

  it("adds first-class querystring parameters and request examples", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn(() => ({
        params: undefined,
        pathParams: undefined,
        body: {
          type: "object",
        },
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn(() => []),
      createDefaultPathParamsSchema: vi.fn(),
      detectContentType: vi.fn(() => "application/json"),
      createRequestBodySchema: vi.fn(() => ({
        content: {
          "application/json": {
            schema: { type: "object" },
            examples: {
              request: {
                value: { q: "hello" },
              },
            },
          },
        },
      })),
      createResponseSchema: vi.fn(),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn(() => true),
      processResponses: vi.fn(() => ({
        200: {
          description: "OK",
        },
      })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("POST", "/events/search", {
      bodyDescription: "Search request",
      querystringType: "SearchFilter",
      querystringName: "advancedQuery",
      querystringExamples: {
        filters: {
          value: { status: "active" },
        },
      },
      requestExamples: {
        request: {
          value: { q: "hello" },
        },
      },
    });

    expect(schemaProcessor.getSchemaContent).toHaveBeenCalledWith({
      paramsType: "SearchFilter",
    });
    expect(result.definition.parameters).toContainEqual({
      in: "querystring",
      name: "advancedQuery",
      required: false,
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            $ref: "#/components/schemas/SearchFilter",
          },
          examples: {
            filters: {
              value: {
                status: "active",
              },
            },
          },
        },
      },
    });
  });
});
