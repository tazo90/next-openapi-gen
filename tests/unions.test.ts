import { describe, it, expect, beforeEach } from "vitest";
import { SchemaProcessor } from "../src/lib/schema-processor.js";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";

describe("Union Type Support", () => {
  describe("TypeScript Unions", () => {
    let processor: SchemaProcessor;
    const fixturesDir = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "unions"
    );

    beforeEach(() => {
      processor = new SchemaProcessor(fixturesDir, "typescript");
    });

    describe("Literal Unions (should become enums)", () => {
      it("should convert string literal union to enum", () => {
        const schema = processor.findSchemaDefinition("Status", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["active", "inactive", "pending"]);
      });

      it("should convert user role literal union to enum", () => {
        const schema = processor.findSchemaDefinition("UserRole", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["admin", "member", "guest"]);
      });

      it("should convert HTTP method literal union to enum", () => {
        const schema = processor.findSchemaDefinition("HttpMethod", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
      });

      it("should convert numeric literal union to enum", () => {
        const schema = processor.findSchemaDefinition("Priority", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("number");
        expect(schema.enum).toEqual([1, 2, 3, 4, 5]);
      });
    });

    describe("Type Reference Unions (should use oneOf)", () => {
      it("should convert type reference union to oneOf", () => {
        const schema = processor.findSchemaDefinition("ApiResponse", "");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);

        // Check that references are created
        const hasSuccessRef = schema.oneOf.some(
          (item: any) =>
            item.$ref === "#/components/schemas/SuccessResponse" ||
            (item.type === "object" &&
              item.properties?.success &&
              item.properties?.data)
        );
        const hasErrorRef = schema.oneOf.some(
          (item: any) =>
            item.$ref === "#/components/schemas/ErrorResponse" ||
            (item.type === "object" &&
              item.properties?.success &&
              item.properties?.error)
        );

        expect(hasSuccessRef || hasErrorRef).toBe(true);
      });
    });

    describe("Nullable Types (should add nullable: true)", () => {
      it("should handle string | null", () => {
        const schema = processor.findSchemaDefinition("OptionalString", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.nullable).toBe(true);
      });

      it("should handle number | null", () => {
        const schema = processor.findSchemaDefinition("OptionalNumber", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("number");
        expect(schema.nullable).toBe(true);
      });

      it("should handle object | null", () => {
        const schema = processor.findSchemaDefinition("OptionalObject", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("object");
        expect(schema.nullable).toBe(true);
        expect(schema.properties).toBeDefined();
      });

      it("should handle string | undefined", () => {
        const schema = processor.findSchemaDefinition("MaybeString", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.nullable).toBe(true);
      });

      it("should handle string | null | undefined", () => {
        const schema = processor.findSchemaDefinition(
          "NullableOrUndefined",
          ""
        );

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.nullable).toBe(true);
      });
    });

    describe("Discriminated Unions", () => {
      it("should handle discriminated union with oneOf", () => {
        const schema = processor.findSchemaDefinition("Notification", "");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(3);

        // Verify that each variant is either a reference or an object
        schema.oneOf.forEach((variant: any) => {
          expect(
            variant.$ref !== undefined || variant.type === "object"
          ).toBe(true);
        });
      });

      it("should handle payment method discriminated union", () => {
        const schema = processor.findSchemaDefinition("PaymentMethod", "");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(3);
      });
    });

    describe("Mixed Unions", () => {
      it("should handle literal and reference mixed union", () => {
        const schema = processor.findSchemaDefinition("LoadingState", "");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf.length).toBeGreaterThan(0);
      });
    });

    describe("Nested Unions", () => {
      it("should handle nested union types", () => {
        const schema = processor.findSchemaDefinition("ComplexType", "");

        expect(schema).toBeDefined();
        // Should either have oneOf or be a flattened union
        const hasOneOf = schema.oneOf !== undefined;
        const isNullable = schema.nullable === true;

        expect(hasOneOf || isNullable).toBe(true);
      });
    });

    describe("Unions in Object Properties", () => {
      it("should handle union types in object properties", () => {
        const schema = processor.findSchemaDefinition("ApiResult", "");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
        expect(schema.properties.status).toBeDefined();

        // Status should be an enum or oneOf
        const statusProp = schema.properties.status;
        expect(statusProp.enum || statusProp.oneOf).toBeDefined();
      });
    });

    describe("Response Types", () => {
      it("should handle GetUserResponse union", () => {
        const schema = processor.findSchemaDefinition("GetUserResponse", "");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);
      });
    });
  });

  describe("Zod Unions", () => {
    let converter: ZodSchemaConverter;
    const fixturesDir = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "unions"
    );

    beforeEach(() => {
      converter = new ZodSchemaConverter(fixturesDir);
    });

    describe("Simple Unions (should use oneOf)", () => {
      it("should convert z.union([z.string(), z.number()]) to oneOf", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "StringOrNumberSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);
        expect(schema.oneOf).toContainEqual({ type: "string" });
        expect(schema.oneOf).toContainEqual({ type: "number" });
      });

      it("should handle z.union([z.string(), z.boolean()])", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "StringOrBooleanSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);
      });

      it("should handle primitive union", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "PrimitiveUnionSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(3);
      });
    });

    describe("Literal Unions (should become enums)", () => {
      it("should convert literal union to enum", () => {
        const schema = converter.convertZodSchemaToOpenApi("StatusSchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["active", "inactive", "pending"]);
      });

      it("should convert user role literal union to enum", () => {
        const schema = converter.convertZodSchemaToOpenApi("UserRoleSchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["admin", "member", "guest"]);
      });

      it("should convert HTTP method literal union to enum", () => {
        const schema = converter.convertZodSchemaToOpenApi("HttpMethodSchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
      });

      it("should convert numeric literal union to enum", () => {
        const schema = converter.convertZodSchemaToOpenApi("PrioritySchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("number");
        expect(schema.enum).toEqual([1, 2, 3, 4, 5]);
      });
    });

    describe("Nullable Unions (should add nullable: true)", () => {
      it("should handle z.union([z.string(), z.null()])", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "NullableStringSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.nullable).toBe(true);
      });

      it("should handle z.union([z.number(), z.null()])", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "NullableNumberSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.type).toBe("number");
        expect(schema.nullable).toBe(true);
      });

      it("should handle z.union([z.object(...), z.null()])", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "NullableObjectSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.type).toBe("object");
        expect(schema.nullable).toBe(true);
        expect(schema.properties).toBeDefined();
      });
    });

    describe("Schema Reference Unions", () => {
      it("should handle API response union", () => {
        const schema = converter.convertZodSchemaToOpenApi("ApiResponseSchema");

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);
      });
    });

    describe("Discriminated Unions", () => {
      it("should handle z.discriminatedUnion with discriminator property", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "NotificationSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(3);
        expect(schema.discriminator).toBeDefined();
        expect(schema.discriminator.propertyName).toBe("type");
      });

      it("should handle payment method discriminated union", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "PaymentMethodSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(3);
        expect(schema.discriminator).toBeDefined();
        expect(schema.discriminator.propertyName).toBe("type");
      });

      it("should handle GetUserResponse discriminated union", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "GetUserResponseSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.oneOf).toBeDefined();
        expect(schema.oneOf).toHaveLength(2);
        expect(schema.discriminator).toBeDefined();
        expect(schema.discriminator.propertyName).toBe("status");
      });
    });

    describe("Optional/Undefined Unions", () => {
      it("should handle z.union([z.string(), z.undefined()])", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "OptionalStringSchema"
        );

        expect(schema).toBeDefined();
        // Should handle undefined as nullable
        expect(
          schema.type === "string" ||
            schema.oneOf !== undefined
        ).toBe(true);
      });
    });

    describe("Array of Union Types", () => {
      it("should handle array of union types", () => {
        const schema = converter.convertZodSchemaToOpenApi("MixedArraySchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("array");
        expect(schema.items).toBeDefined();
        expect(schema.items.oneOf).toBeDefined();
      });
    });

    describe("Union in Object Properties", () => {
      it("should handle union types in object properties", () => {
        const schema = converter.convertZodSchemaToOpenApi("ApiResultSchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
        expect(schema.properties.status).toBeDefined();

        // Status should be an enum
        const statusProp = schema.properties.status;
        expect(statusProp.type).toBe("string");
        expect(statusProp.enum).toBeDefined();
      });
    });

    describe("Comparison: z.enum vs z.union with literals", () => {
      it("z.enum should produce enum schema", () => {
        const schema = converter.convertZodSchemaToOpenApi("StatusEnumSchema");

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["active", "inactive", "pending"]);
      });

      it("z.union with literals should also produce enum schema", () => {
        const schema = converter.convertZodSchemaToOpenApi(
          "StatusLiteralUnionSchema"
        );

        expect(schema).toBeDefined();
        expect(schema.type).toBe("string");
        expect(schema.enum).toEqual(["active", "inactive", "pending"]);
      });
    });
  });
});
