import { describe, expect, it, vi } from "vitest";

import { ResponseProcessor } from "@workspace/openapi-core/routes/response-processor.js";

describe("ResponseProcessor", () => {
  it("omits content for 204 responses and DELETE defaults", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    expect(processor.processResponses({}, "DELETE")).toEqual({
      204: {
        description: "No Content",
      },
    });

    expect(
      processor.processResponses(
        {
          responseType: "DeletedItem",
          successCode: "204",
        },
        "DELETE",
      ),
    ).toEqual({
      204: {
        description: "No Content",
      },
    });
  });

  it("builds nested array schemas for typed success responses", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseType: "User[][]",
      },
      "GET",
    );

    expect(schemaProcessor.ensureSchemaResolved).toHaveBeenCalledWith("User", "response");
    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/User",
              },
            },
          },
        },
      },
    });
  });

  it("adds configured response sets and custom response references", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        defaultResponseSet: "errors",
        responseSets: {
          errors: ["401", "404"],
        },
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        addResponses: "409:ConflictResponse,204",
      },
      "POST",
    );

    expect(responses["201"]).toBeUndefined();
    expect(responses["401"]).toEqual({ $ref: "#/components/responses/401" });
    expect(responses["404"]).toEqual({ $ref: "#/components/responses/404" });
    expect(responses["409"]).toEqual({
      description: "Conflict",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ConflictResponse" },
        },
      },
    });
    expect(responses["204"]).toEqual({ $ref: "#/components/responses/204" });
  });

  it("ignores missing response sets and uses fallback descriptions for custom schema refs", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        defaultResponseSet: "shared,missing",
        responseSets: {
          shared: ["401"],
        },
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseType: "Healthcheck",
        addResponses: "418:TeapotError",
      },
      "GET",
    );

    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Healthcheck" },
        },
      },
    });
    expect(responses["401"]).toEqual({ $ref: "#/components/responses/401" });
    expect(responses["418"]).toEqual({
      description: "HTTP 418",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/TeapotError" },
        },
      },
    });
  });

  it("uses inline descriptions for custom @add response schemas", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        addResponses:
          "400:ValidationError:Invalid notification data,429:RateLimitError:Rate limit exceeded",
      },
      "POST",
    );

    expect(responses["400"]).toEqual({
      description: "Invalid notification data",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ValidationError" },
        },
      },
    });
    expect(responses["429"]).toEqual({
      description: "Rate limit exceeded",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/RateLimitError" },
        },
      },
    });
  });

  it("skips malformed custom responses and adds explicit 204 descriptions", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseSet: "none",
        addResponses: ":Broken,204:NoContentResponse",
      },
      "GET",
    );

    expect(schemaProcessor.ensureSchemaResolved).toHaveBeenCalledWith(
      "NoContentResponse",
      "response",
    );
    expect(responses).toEqual({
      204: {
        description: "HTTP 204",
      },
    });
  });

  it("only supports request bodies for mutation methods", () => {
    const processor = new ResponseProcessor(
      { diagnostics: { enabled: true } } as never,
      {} as never,
    );

    expect(processor.supportsRequestBody("GET")).toBe(false);
    expect(processor.supportsRequestBody("PATCH")).toBe(true);
    expect(processor.supportsRequestBody("POST")).toBe(true);
    expect(processor.supportsRequestBody("PUT")).toBe(true);
  });

  it("uses inferred responses when no explicit @response tag exists", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        inferredResponses: [
          {
            typeName: "PostResponse",
            contentType: "application/json",
            source: "typescript",
          },
        ],
      },
      "GET",
    );

    expect(schemaProcessor.ensureSchemaResolved).toHaveBeenCalledWith("PostResponse", "response");
    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/PostResponse" },
        },
      },
    });
  });

  it("prefers inferred success status codes over mutation defaults", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
      resolveTypeExpression: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseType: "SearchResponse",
        inferredResponses: [
          {
            statusCode: "200",
            typeName: "SearchResponse",
            source: "typescript",
          },
        ],
      },
      "POST",
    );

    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/SearchResponse" },
        },
      },
    });
    expect(responses["201"]).toBeUndefined();
  });

  it("supports inline response type expressions", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
      resolveTypeExpression: vi.fn(() => ({
        type: "object",
        properties: {
          success: {
            type: "boolean",
          },
        },
        required: ["success"],
      })),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseType: "{ success: boolean }",
      },
      "DELETE",
    );

    expect(schemaProcessor.resolveTypeExpression).toHaveBeenCalledWith("{ success: boolean }");
    expect(responses["204"]).toBeUndefined();
    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: {
                type: "boolean",
              },
            },
            required: ["success"],
          },
        },
      },
    });
  });

  it("emits sequential media and examples for first-class 3.2 response metadata", () => {
    const schemaProcessor = {
      ensureSchemaResolved: vi.fn(),
    };
    const processor = new ResponseProcessor(
      {
        diagnostics: { enabled: true },
      } as never,
      schemaProcessor as never,
    );

    const responses = processor.processResponses(
      {
        responseItemType: "EventChunk",
        responseContentType: "text/event-stream",
        responseItemEncoding: {
          headers: {
            "content-type": "application/json",
          },
        },
        responsePrefixEncoding: [{ type: "text" }],
        responseExamples: {
          structured: {
            value: { id: "evt_1" },
          },
          wire: {
            serializedValue: 'data: {"id":"evt_1"}\n\n',
          },
        },
      },
      "GET",
    );

    expect(responses["200"]).toEqual({
      description: "Successful response",
      content: {
        "text/event-stream": {
          itemSchema: {
            $ref: "#/components/schemas/EventChunk",
          },
          itemEncoding: {
            headers: {
              "content-type": "application/json",
            },
          },
          prefixEncoding: [{ type: "text" }],
          examples: {
            structured: {
              value: { id: "evt_1" },
            },
            wire: {
              serializedValue: 'data: {"id":"evt_1"}\n\n',
            },
          },
        },
      },
    });
  });
});
