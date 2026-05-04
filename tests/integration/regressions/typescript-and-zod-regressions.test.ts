import path from "path";

import { beforeEach, describe, expect, it } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe("TypeScript and Zod regression scenarios", () => {
  describe("TypeScript fixtures", () => {
    let utilityProcessor: SchemaProcessor;
    let unionProcessor: SchemaProcessor;

    beforeEach(() => {
      utilityProcessor = new SchemaProcessor(
        path.join(process.cwd(), "tests", "fixtures", "utility-types"),
        "typescript",
      );
      unionProcessor = new SchemaProcessor(
        path.join(process.cwd(), "tests", "fixtures", "unions"),
        "typescript",
      );
    });

    it("resolves Awaited<ReturnType<typeof fn>> utility types", () => {
      const schema = utilityProcessor.findSchemaDefinition("AwaitedReturnType", "");

      expect(schema.type).toBe("object");
      expect(schema.properties?.name).toEqual({ type: "string" });
      expect(schema.properties?.firstName).toEqual({ type: "string" });
    });

    it("supports discriminated and literal unions", () => {
      const notification = unionProcessor.findSchemaDefinition("Notification", "");
      const status = unionProcessor.findSchemaDefinition("Status", "");

      expect(notification.oneOf).toHaveLength(3);
      expect(status.enum).toEqual(["active", "inactive", "pending"]);
    });

    it("resolves the real product example fixture", () => {
      const processor = new SchemaProcessor(
        path.join(process.cwd(), "tests", "fixtures", "product-example"),
        "typescript",
      );

      const schema = processor.findSchemaDefinition("ProductByIdResponse", "");
      const getResponse = processor.findSchemaDefinition("GetProductApiResponse", "");
      const createResponse = processor.findSchemaDefinition("CreateProductApiResponse", "");

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(getResponse).toMatchObject({
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
          timestamp: { type: "string" },
        },
      });
      expect(createResponse).toMatchObject({
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
          timestamp: { type: "string" },
        },
      });
    });
  });

  describe("TypeScript property JSDoc (issue #129)", () => {
    it("maps each property to its own leading JSDoc comment, not the next property's comment", () => {
      // Regression for https://github.com/tazo90/next-openapi-gen/issues/129:
      // trailingComments caused an off-by-one — every property received the comment
      // of the *next* property.  The fix switches to leadingComments.
      const processor = new SchemaProcessor(
        path.join(process.cwd(), "tests", "fixtures", "ts-property-jsdoc"),
        "typescript",
      );

      const schema = processor.findSchemaDefinition("AliveResponse", "");

      expect(schema.type).toBe("object");
      expect(schema.properties?.status).toMatchObject({ type: "string", example: "alive" });
      expect(schema.properties?.timestamp).toMatchObject({
        type: "string",
        format: "date-time",
        example: "2025-11-26T22:00:00.000Z",
      });
      expect(schema.properties?.uptime).toMatchObject({
        type: "number",
        description: "Process uptime in seconds",
        example: 123.45,
      });
    });
  });

  describe("Zod fixtures", () => {
    it("supports discriminated unions from zod fixtures", () => {
      const converter = new ZodSchemaConverter(
        path.join(process.cwd(), "tests", "fixtures", "unions"),
      );
      const schema = converter.convertZodSchemaToOpenApi("NotificationSchema");

      expect(schema?.oneOf).toHaveLength(3);
      expect(schema?.discriminator?.propertyName).toBe("type");
    });
  });
});
