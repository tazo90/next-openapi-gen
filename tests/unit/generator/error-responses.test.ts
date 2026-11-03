import { describe, expect, it } from "vitest";

import {
  createErrorResponseComponent,
  generateErrorResponsesFromConfig,
  guessHttpStatus,
  processTemplateVariables,
} from "@workspace/openapi-core/generator/error-responses.js";

describe("generator error response helpers", () => {
  it("guesses HTTP statuses from explicit codes and error names", () => {
    expect(guessHttpStatus("418")).toBe(418);
    expect(guessHttpStatus("permission_denied")).toBe(403);
    expect(guessHttpStatus("auth_expired")).toBe(401);
    expect(guessHttpStatus("mystery_error")).toBe(500);
  });

  it("replaces template variables and builds response components", () => {
    expect(
      processTemplateVariables(
        {
          message: "{{MESSAGE}}",
          status: "{{STATUS}}",
        },
        {
          MESSAGE: "Created",
          STATUS: "201",
        },
      ),
    ).toEqual({
      message: "Created",
      status: "201",
    });

    expect(
      createErrorResponseComponent({
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
  });

  it("adds configured error responses when a response section exists", () => {
    const document = {
      components: {
        responses: {},
      },
    };

    generateErrorResponsesFromConfig(document, {
      template: {
        type: "object",
        properties: {
          code: { example: "{{ERROR_CODE}}" },
          status: { example: "{{HTTP_STATUS}}" },
        },
      },
      codes: {
        AUTH_EXPIRED: {
          description: "Authentication expired",
        },
      },
    });

    expect(document.components.responses["401"]).toEqual({
      description: "Authentication expired",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              code: { example: "AUTH_EXPIRED" },
              status: { example: "401" },
            },
          },
        },
      },
    });
  });

  it("uses errorConfig.contentType for every generated error response", () => {
    const document = { components: { responses: {} } };

    generateErrorResponsesFromConfig(document, {
      contentType: "application/problem+json",
      template: { type: "object" },
      codes: {
        "404": { description: "Not found" },
        "409": { description: "Conflict" },
      },
    });

    expect(Object.keys(document.components.responses["404"].content)).toEqual([
      "application/problem+json",
    ]);
    expect(Object.keys(document.components.responses["409"].content)).toEqual([
      "application/problem+json",
    ]);
  });

  it("lets a per-code contentType override errorConfig.contentType", () => {
    const document = { components: { responses: {} } };

    generateErrorResponsesFromConfig(document, {
      contentType: "application/problem+json",
      template: { type: "object" },
      codes: {
        "404": { description: "Not found" },
        "500": { description: "Boom", contentType: "text/plain" },
      },
    });

    expect(Object.keys(document.components.responses["404"].content)).toEqual([
      "application/problem+json",
    ]);
    expect(Object.keys(document.components.responses["500"].content)).toEqual(["text/plain"]);
  });

  it("falls back to application/json for a per-code override without a global default", () => {
    const document = { components: { responses: {} } };

    generateErrorResponsesFromConfig(document, {
      template: { type: "object" },
      codes: {
        "404": { description: "Not found" },
        "422": { description: "Invalid", contentType: "application/problem+json" },
      },
    });

    expect(Object.keys(document.components.responses["404"].content)).toEqual(["application/json"]);
    expect(Object.keys(document.components.responses["422"].content)).toEqual([
      "application/problem+json",
    ]);
  });

  it("uses ErrorDefinition.contentType for manual error responses", () => {
    expect(
      createErrorResponseComponent({
        description: "Conflict",
        schema: { type: "object" },
        contentType: "application/problem+json",
      }),
    ).toEqual({
      description: "Conflict",
      content: {
        "application/problem+json": {
          schema: { type: "object" },
        },
      },
    });
  });

  it("no-ops when the document has no responses section", () => {
    expect(() =>
      generateErrorResponsesFromConfig(
        {
          components: {},
        },
        {
          template: {},
          codes: {},
        },
      ),
    ).not.toThrow();
  });
});
