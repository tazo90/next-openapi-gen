import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe("ZodSchemaConverter drizzle-zod support", () => {
  it("expands factory-generated pagination schemas", () => {
    const converter = new ZodSchemaConverter("apps/next-app-zod/src/schemas");
    const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "object",
      properties: {
        data: {
          type: "array",
        },
        pagination: {
          allOf: [{ $ref: expect.stringContaining("PaginationMeta") }],
          description: "Pagination metadata",
        },
      },
    });
    expect(converter.zodSchemas["PaginationMeta"]).toBeDefined();
  });

  it("supports alternate factory patterns and caches discovered factories", () => {
    const converter = new ZodSchemaConverter("apps/next-app-zod/src/schemas");

    const alternativeResult = converter.convertZodSchemaToOpenApi(
      "PaginatedUsersAlternativeSchema",
    );
    const envelopeResult = converter.convertZodSchemaToOpenApi("UserEnvelopeSchema");

    expect(alternativeResult).not.toBeNull();
    expect(alternativeResult?.properties).toHaveProperty("items");
    expect(alternativeResult?.properties).toHaveProperty("meta");

    expect(envelopeResult).not.toBeNull();
    expect(envelopeResult?.properties).toHaveProperty("success");
    expect(envelopeResult?.properties).toHaveProperty("data");
    expect(converter.factoryCache.size).toBeGreaterThan(0);
  });
});
