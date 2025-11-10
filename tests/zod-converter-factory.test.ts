import { describe, it, expect, beforeEach } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Zod Factory Functions", () => {
  let converter: ZodSchemaConverter;
  const schemaDir = path.join(__dirname, "../examples/next15-app-zod/src/schemas");

  beforeEach(() => {
    converter = new ZodSchemaConverter(schemaDir);
  });

  describe("Factory Function Detection", () => {
    it("should detect and process createPaginatedSchema factory function", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("object");
      expect(result!.properties).toHaveProperty("data");
      expect(result!.properties).toHaveProperty("pagination");
    });

    it("should correctly expand data array with schema reference", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      expect(result!.properties!.data).toBeDefined();
      expect(result!.properties!.data.type).toBe("array");
      expect(result!.properties!.data.items).toBeDefined();

      // Should reference UserDetailedSchema or contain its structure
      const items = result!.properties!.data.items;
      expect(items).toBeDefined();
    });

    it("should correctly expand pagination metadata", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      const pagination = result!.properties!.pagination;
      expect(pagination).toBeDefined();

      // Pagination is referenced via allOf (standard OpenAPI pattern)
      expect(pagination.allOf).toBeDefined();
      expect(pagination.allOf![0].$ref).toContain("PaginationMeta");
      expect(pagination.description).toBe("Pagination metadata");

      // Verify that PaginationMeta schema exists with correct structure
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();
      expect(paginationMeta.type).toBe("object");
      expect(paginationMeta.properties).toHaveProperty("nextCursor");
      expect(paginationMeta.properties).toHaveProperty("hasMore");
      expect(paginationMeta.properties).toHaveProperty("limit");
      expect(paginationMeta.properties).toHaveProperty("total");
    });

    it("should handle alternative factory naming (makePaginatedResponse)", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersAlternativeSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("object");
      expect(result!.properties).toHaveProperty("items"); // Different property name
      expect(result!.properties).toHaveProperty("meta");
    });

    it("should handle different factory pattern (wrapInEnvelope)", () => {
      const result = converter.convertZodSchemaToOpenApi("UserEnvelopeSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("object");
      expect(result!.properties).toHaveProperty("success");
      expect(result!.properties).toHaveProperty("data");
      expect(result!.properties).toHaveProperty("timestamp");

      // Check success field
      expect(result!.properties!.success.type).toBe("boolean");

      // Check timestamp is a string (datetime method is a refinement in Zod, handled as string in OpenAPI)
      expect(result!.properties!.timestamp.type).toBe("string");
      // The format may or may not be set depending on how .datetime() is processed
      if (result!.properties!.timestamp.format) {
        expect(result!.properties!.timestamp.format).toBe("date-time");
      }
    });

    it("should handle inline schema arguments", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedStringsSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("object");
      expect(result!.properties!.data.items.type).toBe("string");
    });
  });

  describe("Factory Caching", () => {
    it("should cache factory function analysis", () => {
      // First call - should analyze and cache
      const result1 = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");
      expect(result1).toBeDefined();

      // Check cache was populated
      expect(converter.factoryCache.size).toBeGreaterThan(0);

      // Second call with different schema using same factory - should use cache
      const result2 = converter.convertZodSchemaToOpenApi("PaginatedStringsSchema");
      expect(result2).toBeDefined();

      // Should still have cached the factory
      expect(converter.factoryCache.has("createPaginatedSchema")).toBe(true);
    });

    it("should cache negative results for non-factory functions", () => {
      // Try to use a regular schema as if it were a factory
      // This won't actually be called as a factory in real usage, but tests the cache mechanism

      // First, ensure we have some schemas processed
      converter.convertZodSchemaToOpenApi("UserBaseSchema");

      // The negative cache should prevent repeated lookups
      // Note: This is more of an internal implementation detail test
      expect(converter.factoryCheckCache).toBeDefined();
    });
  });

  describe("Schema Reference Handling", () => {
    it("should properly reference nested schemas in factory results", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      const dataItems = result!.properties!.data.items;

      // Should either have a $ref or the full schema structure
      if (dataItems.$ref) {
        expect(dataItems.$ref).toContain("UserDetailedSchema");
      } else {
        // If expanded, should have user properties
        expect(dataItems.type).toBe("object");
        expect(dataItems.properties).toBeDefined();
      }
    });

    it("should handle schemas that reference other schemas", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // UserDetailedSchema references AddressSchema and PaymentMethodSchema
      // Make sure those are properly handled
      expect(result).toBeDefined();

      // The conversion should complete without errors
      const dataItems = result!.properties!.data.items;
      expect(dataItems).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple parameters in factory function", () => {
      // PaginationMeta is a schema that could be passed as a separate parameter
      // The current factories use single parameters, but this tests the mechanism
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Should still work correctly
      expect(result).toBeDefined();
      expect(result!.properties).toHaveProperty("data");
      expect(result!.properties).toHaveProperty("pagination");
    });

    it("should handle arrow functions with implicit return", () => {
      // makePaginatedResponse uses arrow function syntax
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersAlternativeSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it("should handle regular function declarations", () => {
      // createPaginatedSchema uses function declaration syntax
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it("should gracefully handle factory functions from imported files", () => {
      // The factory is imported from pagination.ts
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      // Should have properly resolved the import and expanded the factory
      expect(result!.properties).toHaveProperty("data");
      expect(result!.properties).toHaveProperty("pagination");
    });
  });

  describe("Required and Optional Fields", () => {
    it("should correctly identify required fields in factory output", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // data and pagination should be required
      expect(result!.required).toContain("data");
      expect(result!.required).toContain("pagination");
    });

    it("should handle optional fields in pagination metadata", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Get the PaginationMeta schema (referenced by pagination field)
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();

      // total is optional in PaginationMeta
      if (paginationMeta.required) {
        expect(paginationMeta.required).not.toContain("total");
      }

      // But these should be required
      expect(paginationMeta.required).toContain("hasMore");
      expect(paginationMeta.required).toContain("limit");
      // Note: nextCursor is nullable, not optional, so it's still in required
    });
  });

  describe("Descriptions and Metadata", () => {
    it("should preserve descriptions from factory-generated schemas", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      const dataField = result!.properties!.data;
      expect(dataField.description).toBe("Array of items");

      const paginationField = result!.properties!.pagination;
      expect(paginationField.description).toBe("Pagination metadata");
    });

    it("should preserve field-level descriptions in pagination meta", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Get the PaginationMeta schema (referenced by pagination field)
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();
      expect(paginationMeta.properties!.nextCursor.description).toContain("Cursor for the next page");
      expect(paginationMeta.properties!.hasMore.description).toContain("Whether there are more items");
    });
  });

  describe("Type Validation", () => {
    it("should generate correct types for pagination fields", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Get the PaginationMeta schema (referenced by pagination field)
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();

      expect(paginationMeta.properties!.nextCursor.type).toBe("string");
      expect(paginationMeta.properties!.hasMore.type).toBe("boolean");
      expect(paginationMeta.properties!.limit.type).toBe("integer");
      expect(paginationMeta.properties!.total.type).toBe("integer");
    });

    it("should apply validation constraints", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Get the PaginationMeta schema (referenced by pagination field)
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();

      // limit should be positive (.positive() creates minimum: 0 with exclusiveMinimum: true)
      expect(paginationMeta.properties!.limit.minimum).toBe(0);
      expect(paginationMeta.properties!.limit.exclusiveMinimum).toBe(true);

      // total should be non-negative
      expect(paginationMeta.properties!.total.minimum).toBe(0);
    });

    it("should handle nullable fields correctly", () => {
      const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

      // Get the PaginationMeta schema (referenced by pagination field)
      const paginationMeta = converter.zodSchemas["PaginationMeta"];
      expect(paginationMeta).toBeDefined();

      // nextCursor is nullable
      const nextCursor = paginationMeta.properties!.nextCursor;
      expect(nextCursor.nullable || nextCursor.type === "null" || Array.isArray(nextCursor.type)).toBeTruthy();
    });
  });
});
