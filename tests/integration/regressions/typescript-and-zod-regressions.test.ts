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

  describe("Zod fixtures", () => {
    it("supports discriminated unions from zod fixtures", () => {
      const converter = new ZodSchemaConverter(
        path.join(process.cwd(), "tests", "fixtures", "unions"),
      );
      const schema = converter.convertZodSchemaToOpenApi("NotificationSchema");

      expect(schema?.oneOf).toHaveLength(3);
      expect(schema?.discriminator?.propertyName).toBe("type");
    });

    it("does not infinite-recurse on re-export files using z.infer<typeof schema>", () => {
      // Regression for https://github.com/tazo90/next-openapi-gen/issues/127:
      // scanning a schemaDir that contains a barrel file with only
      // `import type { X }` + `export type Y = z.infer<typeof X>` caused unbounded
      // recursion in processFileForZodSchema → RangeError / heap OOM.
      const converter = new ZodSchemaConverter(
        path.join(process.cwd(), "tests", "fixtures", "zod-reexport-recursion"),
      );

      const schema = converter.convertZodSchemaToOpenApi("apiErrorSchema");

      expect(schema).toBeDefined();
      expect(schema?.type).toBe("object");
      expect(schema?.properties?.message).toEqual({ type: "string" });
      expect(schema?.properties?.issues).toBeDefined();
    });
  });
});
