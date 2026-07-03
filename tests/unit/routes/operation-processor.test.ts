import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

import { OperationProcessor } from "@workspace/openapi-core/routes/operation-processor.js";

describe("OperationProcessor", () => {
  it("builds mutation operations with auth, path params, and referenced request bodies", () => {
    const createRequestParamsSchema = vi.fn<MockFn>();
    createRequestParamsSchema
      .mockReturnValueOnce([
        { in: "query", name: "search", required: true, schema: { type: "string" } },
      ])
      .mockReturnValueOnce([
        { in: "path", name: "id", required: true, schema: { type: "string" } },
      ]);

    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(({ bodyType }: { bodyType?: string }) =>
        bodyType
          ? {
              params: {},
              querystring: {},
              pathParams: {},
              body: {
                properties: {
                  upload: {
                    contentMediaType: "image/png",
                    description: "Avatar upload",
                    type: "object",
                  },
                },
                type: "object",
              },
              responses: {},
            }
          : {
              params: { properties: { search: { type: "string", required: true } } },
              querystring: {},
              pathParams: {
                properties: {
                  id: { type: "string", required: true },
                },
              },
              body: {},
              responses: {},
            },
      ),
      createRequestParamsSchema,
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(() => "multipart/form-data"),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((typeName) => typeName),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({
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
        auth: "bearer,apikey",
        deprecated: true,
        summary: "Create user",
        description: "Creates a user",
        paramsType: "SearchParams",
        pathParamsType: "UserIdParams",
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
              encoding: {
                upload: {
                  contentType: "image/png",
                },
              },
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

  it("emits a default multipart file request body when no body schema is declared", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(),
      createRequestParamsSchema: vi.fn<MockFn>(),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((typeName) => typeName),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({
        200: {
          description: "OK",
        },
      })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("POST", "/uploads/logo", {
      bodyDescription: "Organization logo file",
      contentType: "multipart/form-data",
      tag: "Uploads",
    });

    expect(result.definition.requestBody).toEqual({
      content: {
        "multipart/form-data": {
          schema: {
            properties: {
              file: {
                format: "binary",
                type: "string",
              },
            },
            required: ["file"],
            type: "object",
          },
        },
      },
      description: "Organization logo file",
      required: true,
    });
    expect(schemaProcessor.detectContentType).not.toHaveBeenCalled();
    expect(schemaProcessor.ensureSchemaResolved).not.toHaveBeenCalled();
  });

  it("does not emit a bodyless multipart request body for methods without request bodies", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(),
      createRequestParamsSchema: vi.fn<MockFn>(),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((typeName) => typeName),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({
        200: {
          description: "OK",
        },
      })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("GET", "/uploads/logo", {
      contentType: "multipart/form-data",
      tag: "Uploads",
    });

    expect(result.definition.requestBody).toBeUndefined();
    expect(schemaProcessor.detectContentType).not.toHaveBeenCalled();
  });

  it("uses explicit path params and falls back to generated responses for root routes", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(({ responseType }: { responseType?: string }) =>
        responseType
          ? {
              params: undefined,
              querystring: undefined,
              pathParams: undefined,
              body: undefined,
              responses: { type: "object", properties: { ok: { type: "boolean" } } },
            }
          : {
              params: undefined,
              querystring: undefined,
              pathParams: { properties: { slug: { type: "string", required: true } } },
              body: undefined,
              responses: undefined,
            },
      ),
      createRequestParamsSchema: vi.fn<MockFn>(() => [
        { in: "path", name: "slug", required: true, schema: { type: "string" } },
      ]),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(() => ({
        description: "Body",
      })),
      createResponseSchema: vi.fn<MockFn>(() => ({
        200: {
          description: "Fallback",
        },
      })),
      ensureSchemaResolved: vi.fn<MockFn>(),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({})),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation("GET", "/", {
      tag: "",
      pathParamsType: "RootPathParams",
      responseType: "RootResponse",
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

  it("adds inferred query parameters that are missing from schema-driven params", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        querystring: undefined,
        pathParams: undefined,
        body: undefined,
        responses: {},
      })),
      createRequestParamsSchema: vi.fn<MockFn>(),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(),
      getExampleForParam: vi.fn<MockFn>(() => "123"),
      ensureSchemaResolved: vi.fn<MockFn>(),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({
        200: {
          description: "Successful response",
        },
      })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("PATCH", "/comments", {
      inferredQueryParamNames: ["commentId"],
    });

    expect(result.definition.parameters).toEqual([
      {
        in: "query",
        name: "commentId",
        required: false,
        schema: {
          type: "string",
        },
        example: "123",
      },
    ]);
    expect(schemaProcessor.getExampleForParam).toHaveBeenCalledWith("commentId", "string");
  });
});
describe("OperationProcessor", () => {
  it("builds operation metadata, auth, parameters, request bodies, and responses", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>().mockReturnValueOnce({
        params: "UserQuery",
        querystring: undefined,
        pathParams: undefined,
        body: undefined,
        responses: undefined,
      }),
      createRequestParamsSchema: vi
        .fn<MockFn>()
        .mockReturnValueOnce([{ name: "limit", in: "query", schema: { type: "number" } }]),
      createDefaultPathParamsSchema: vi
        .fn<MockFn>()
        .mockReturnValue([{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      detectContentType: vi.fn<MockFn>(() => "application/json"),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((typeName) => typeName),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({
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
        auth: "bearer,apikey",
        deprecated: true,
        paramsType: "UserQuery",
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
      getSchemaContent: vi.fn<MockFn>(({ responseType }: { responseType?: string }) =>
        responseType
          ? {
              params: undefined,
              querystring: undefined,
              pathParams: undefined,
              body: undefined,
              responses: {
                type: "object",
              },
            }
          : {
              params: undefined,
              querystring: undefined,
              pathParams: "ReportPathParams",
              body: undefined,
              responses: undefined,
            },
      ),
      createRequestParamsSchema: vi.fn<MockFn>(() => [{ name: "teamId", in: "path" }]),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(() => ({ description: "Body schema" })),
      createResponseSchema: vi.fn<MockFn>(() => ({
        200: { description: "Generated response" },
      })),
      ensureSchemaResolved: vi.fn<MockFn>(),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({})),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);

    const result = processor.processOperation("PUT", "/reports", {
      pathParamsType: "ReportPathParams",
      responseType: "ReportResponse",
    });

    expect(result.definition.operationId).toBe("put-reports");
    expect(result.definition.tags).toEqual(["Reports"]);
    expect(result.definition.parameters).toEqual([{ name: "teamId", in: "path" }]);
    expect(result.definition.requestBody).toBeUndefined();
    expect(result.definition.responses).toEqual({
      200: { description: "Generated response" },
    });
  });

  it("adds first-class querystring parameters and request examples", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
            },
          },
        },
        pathParams: undefined,
        body: {
          type: "object",
        },
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn<MockFn>(() => []),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(() => "application/json"),
      createRequestBodySchema: vi.fn<MockFn>(() => ({
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
      createResponseSchema: vi.fn<MockFn>(),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((typeName) => typeName),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({
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

    expect(schemaProcessor.ensureSchemaResolved).toHaveBeenCalledWith("SearchFilter", "params");
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

  it("emits @servers, @externalDocs, @security, @tags plural, and deprecation reason", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        querystring: undefined,
        pathParams: undefined,
        body: undefined,
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn<MockFn>(() => []),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((name: string) => name),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("GET", "/events", {
      tag: "Events",
      tags: ["Platform", "Streaming"],
      servers: [
        { url: "https://api.example.com", description: "Primary" },
        { url: "https://staging.example.com" },
      ],
      externalDocs: { url: "https://docs.example.com", description: "External" },
      security: [{ BearerAuth: ["read:events"] }, { ApiKeyAuth: [] }],
      deprecated: true,
      deprecationReason: "Use /v2/events",
    });

    expect(result.definition.tags).toEqual(["Events", "Platform", "Streaming"]);
    expect(result.definition.servers).toEqual([
      { url: "https://api.example.com", description: "Primary" },
      { url: "https://staging.example.com" },
    ]);
    expect(result.definition.externalDocs).toEqual({
      url: "https://docs.example.com",
      description: "External",
    });
    expect(result.definition.security).toEqual([
      { BearerAuth: ["read:events"] },
      { ApiKeyAuth: [] },
    ]);
    expect(result.definition.deprecated).toBe(true);
    expect(result.definition.description).toContain("Use /v2/events");
  });

  it("emits header/cookie parameters from @header/@cookie JSDoc types", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(({ paramsType }: { paramsType?: string }) => {
        if (paramsType === "RequestHeaders") {
          return {
            params: {
              type: "object",
              properties: { "X-Api-Key": { type: "string" } },
              required: ["X-Api-Key"],
            },
            querystring: undefined,
            pathParams: undefined,
            body: undefined,
            responses: undefined,
          };
        }
        if (paramsType === "SessionCookies") {
          return {
            params: {
              type: "object",
              properties: { session: { type: "string" } },
            },
            querystring: undefined,
            pathParams: undefined,
            body: undefined,
            responses: undefined,
          };
        }
        return {
          params: undefined,
          querystring: undefined,
          pathParams: undefined,
          body: undefined,
          responses: undefined,
        };
      }),
      createRequestParamsSchema: vi.fn<MockFn>(
        (_schema: unknown, _isPath: boolean, forcedIn?: "query" | "path" | "header" | "cookie") => {
          if (forcedIn === "header") {
            return [
              { in: "header", name: "X-Api-Key", required: true, schema: { type: "string" } },
            ];
          }
          if (forcedIn === "cookie") {
            return [{ in: "cookie", name: "session", required: false, schema: { type: "string" } }];
          }
          return [];
        },
      ),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((name: string) => name),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("GET", "/secure", {
      headerType: "RequestHeaders",
      cookieType: "SessionCookies",
    });

    expect(result.definition.parameters).toContainEqual({
      in: "header",
      name: "X-Api-Key",
      required: true,
      schema: { type: "string" },
    });
    expect(result.definition.parameters).toContainEqual({
      in: "cookie",
      name: "session",
      required: false,
      schema: { type: "string" },
    });
  });

  it("applies @openapi-override as a last-step deep merge on the definition", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        querystring: undefined,
        pathParams: undefined,
        body: undefined,
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn<MockFn>(() => []),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((name: string) => name),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({ 200: { description: "OK" } })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("GET", "/custom", {
      tag: "Custom",
      openapiOverride: {
        "x-internal": true,
        "x-rate-limit": 100,
      },
    });

    expect((result.definition as Record<string, unknown>)["x-internal"]).toBe(true);
    expect((result.definition as Record<string, unknown>)["x-rate-limit"]).toBe(100);
  });

  it("@openapi-override requestBody.required merges without destroying content", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        querystring: undefined,
        pathParams: undefined,
        body: { type: "object", properties: { name: { type: "string" } } },
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn<MockFn>(() => []),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(() => "application/json"),
      createRequestBodySchema: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(() => ({ 201: { description: "Created" } })),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((name: string) => name),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => true),
      processResponses: vi.fn<MockFn>(() => ({ 201: { description: "Created" } })),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never);
    const result = processor.processOperation("POST", "/items", {
      tag: "Items",
      bodyType: "CreateItemBody",
      openapiOverride: {
        requestBody: {
          required: true,
          description: "Item data",
        },
      },
    });

    expect(result.definition.requestBody).toBeDefined();
    expect(result.definition.requestBody?.required).toBe(true);
    expect(result.definition.requestBody?.description).toBe("Item data");
    expect(result.definition.requestBody?.content).toBeDefined();
    expect(result.definition.requestBody?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/CreateItemBody",
    );
  });

  it("applies custom authPresets, with user keys winning over defaults", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn<MockFn>(() => ({
        params: undefined,
        pathParams: undefined,
        body: undefined,
        responses: undefined,
      })),
      createRequestParamsSchema: vi.fn<MockFn>(() => []),
      createDefaultPathParamsSchema: vi.fn<MockFn>(),
      detectContentType: vi.fn<MockFn>(),
      createResponseSchema: vi.fn<MockFn>(() => ({})),
      ensureSchemaResolved: vi.fn<MockFn>(),
      getSchemaReferenceName: vi.fn<MockFn>((name: string) => name),
    };
    const responseProcessor = {
      supportsRequestBody: vi.fn<MockFn>(() => false),
      processResponses: vi.fn<MockFn>(() => ({})),
    };

    const processor = new OperationProcessor(schemaProcessor as never, responseProcessor as never, {
      authPresets: { bearer: "JwtAuth", oauth2: "OAuth2Flow" },
    });

    const withOverride = processor.processOperation("GET", "/a", { tag: "A", auth: "bearer" });
    expect(withOverride.definition.security).toEqual([{ JwtAuth: [] }]);

    const withNewPreset = processor.processOperation("GET", "/b", {
      tag: "B",
      auth: "bearer,oauth2",
    });
    expect(withNewPreset.definition.security).toEqual([{ JwtAuth: [] }, { OAuth2Flow: [] }]);

    const passThrough = processor.processOperation("GET", "/c", {
      tag: "C",
      auth: "MyCustomScheme",
    });
    expect(passThrough.definition.security).toEqual([{ MyCustomScheme: [] }]);

    const withSecurity = processor.processOperation("GET", "/d", {
      tag: "D",
      security: [{ bearer: ["read"] }],
    });
    expect(withSecurity.definition.security).toEqual([{ JwtAuth: ["read"] }]);
  });
});
