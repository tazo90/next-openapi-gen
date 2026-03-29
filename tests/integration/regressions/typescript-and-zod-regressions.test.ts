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

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
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
