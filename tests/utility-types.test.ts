import { describe, it, expect, beforeEach } from "vitest";
import { SchemaProcessor } from "../src/lib/schema-processor.js";
import path from "path";

describe("SchemaProcessor - Utility Types", () => {
  let processor: SchemaProcessor;
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "utility-types");

  beforeEach(() => {
    processor = new SchemaProcessor(fixturesDir, "typescript");
  });

  describe("Awaited<T>", () => {
    it("should unwrap Awaited<Promise<User>>", () => {
      const schema = processor.findSchemaDefinition("AwaitedUser", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
      expect(schema.properties.email).toEqual({ type: "string" });
    });

    it("should handle nested Awaited<Promise<Promise<User>>>", () => {
      const schema = processor.findSchemaDefinition("AwaitedNestedUser", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
      expect(schema.properties.email).toEqual({ type: "string" });
    });

    it("should handle Awaited<User> (non-promise)", () => {
      const schema = processor.findSchemaDefinition("AwaitedRegularType", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
      expect(schema.properties.email).toEqual({ type: "string" });
    });
  });

  describe("ReturnType<typeof T>", () => {
    it("should extract return type from async function with annotation", () => {
      const schema = processor.findSchemaDefinition("UserNameByIdResponse", "");

      expect(schema).toBeDefined();
      // Should unwrap the Promise from the async function
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
      expect(schema.properties.firstName).toEqual({ type: "string" });
    });

    it("should handle sync function return types", () => {
      const schema = processor.findSchemaDefinition("CreateUserResponse", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.id).toEqual({ type: "number" });
      expect(schema.properties.name).toEqual({ type: "string" });
    });

    it("should handle arrow function return types", () => {
      const schema = processor.findSchemaDefinition("EmailResponse", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.email).toEqual({ type: "string" });
    });

    it("should return fallback for function without return type annotation", () => {
      const schema = processor.findSchemaDefinition("NoAnnotationResponse", "");

      expect(schema).toBeDefined();
      // Should return default object type due to missing annotation
      expect(schema.type).toBe("object");
    });
  });

  describe("Awaited<ReturnType<typeof T>> - Main Bug Fix", () => {
    it("should handle nested Awaited<ReturnType<typeof func>> correctly", () => {
      const schema = processor.findSchemaDefinition("AwaitedReturnType", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
      expect(schema.properties.firstName).toEqual({ type: "string" });
    });
  });

  describe("Parameters<typeof T>", () => {
    it("should extract parameter types as tuple", () => {
      const schema = processor.findSchemaDefinition("CreateUserParams", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("array");
      expect(schema.prefixItems).toBeDefined();
      expect(schema.prefixItems).toHaveLength(2);

      // First parameter: { name: string }
      expect(schema.prefixItems[0]).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
        },
      });

      // Second parameter: { email: string }
      expect(schema.prefixItems[1]).toEqual({
        type: "object",
        properties: {
          email: { type: "string" },
        },
      });

      expect(schema.minItems).toBe(2);
      expect(schema.maxItems).toBe(2);
    });

    it.skip("should handle indexed access Parameters<T>[0]", () => {
      const schema = processor.findSchemaDefinition("FirstParam", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.name).toEqual({ type: "string" });
    });

    it.skip("should handle indexed access Parameters<T>[1]", () => {
      const schema = processor.findSchemaDefinition("SecondParam", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.email).toEqual({ type: "string" });
    });
  });

  describe("Indexed Access Types", () => {
    it.skip("should handle string property access User[\"name\"]", () => {
      const schema = processor.findSchemaDefinition("UserNameProperty", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("string");
    });

    it.skip("should handle string property access User[\"email\"]", () => {
      const schema = processor.findSchemaDefinition("UserEmailProperty", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("string");
    });
  });

  describe("Edge Cases", () => {
    it("should return fallback for non-existent type", () => {
      const schema = processor.findSchemaDefinition("NonExistentType", "");

      expect(schema).toBeDefined();
      // Should return empty object for non-existent types
      expect(schema).toEqual({});
    });
  });
});
