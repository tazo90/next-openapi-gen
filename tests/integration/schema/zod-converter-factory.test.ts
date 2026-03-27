import path from "path";

import { beforeEach, describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@next-openapi-gen/schema/zod/zod-converter.js";

describe("Zod factory functions", () => {
  let converter: ZodSchemaConverter;
  const schemaDir = path.join(process.cwd(), "apps", "next-app-zod", "src", "schemas");

  beforeEach(() => {
    converter = new ZodSchemaConverter(schemaDir);
  });

  it("detects and expands paginated factory schemas", () => {
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
  });

  it("handles alternative factory naming and imported factory functions", () => {
    const alternative = converter.convertZodSchemaToOpenApi("PaginatedUsersAlternativeSchema");
    const inline = converter.convertZodSchemaToOpenApi("PaginatedStringsSchema");

    expect(alternative).not.toBeNull();
    expect(alternative?.properties).toHaveProperty("items");
    expect(alternative?.properties).toHaveProperty("meta");

    expect(inline).not.toBeNull();
    expect(inline?.properties?.data?.items?.type).toBe("string");
  });

  it("caches analyzed factory functions", () => {
    converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");
    converter.convertZodSchemaToOpenApi("PaginatedStringsSchema");

    expect(converter.factoryCache.size).toBeGreaterThan(0);
    expect(converter.factoryCheckCache).toBeDefined();
  });
});
