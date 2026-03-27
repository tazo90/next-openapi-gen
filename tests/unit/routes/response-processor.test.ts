import { describe, expect, it, vi } from "vitest";

import { ResponseProcessor } from "@next-openapi-gen/routes/response-processor.js";

describe("ResponseProcessor", () => {
  it("omits content for 204 responses and DELETE defaults", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn(),
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
          responseDescription: "Deleted",
        },
        "DELETE",
      ),
    ).toEqual({
      204: {
        description: "Deleted",
      },
    });
  });

  it("builds nested array schemas for typed success responses", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn(),
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

    expect(schemaProcessor.getSchemaContent).toHaveBeenCalledWith({
      responseType: "User",
    });
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
      getSchemaContent: vi.fn(),
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

  it("skips malformed custom responses and adds explicit 204 descriptions", () => {
    const schemaProcessor = {
      getSchemaContent: vi.fn(),
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

    expect(schemaProcessor.getSchemaContent).toHaveBeenCalledWith({
      responseType: "NoContentResponse",
    });
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
});
