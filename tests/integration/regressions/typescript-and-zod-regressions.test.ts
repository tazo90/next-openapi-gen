import fs from "node:fs";
import os from "node:os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe("TypeScript and Zod regression scenarios", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

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

    it("resolves schema under @id override name and hides original name from getDefinedSchemas", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-regression-schema-id-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          "/** @id Audio */",
          "export interface AudioInterface {",
          "  url: string;",
          "  title?: string;",
          "}",
          "",
          "export type Response = { audio: AudioInterface };",
        ].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");

      const audioSchema = processor.findSchemaDefinition("Audio", "response");
      expect(audioSchema).toEqual({
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
        },
        required: ["url"],
      });

      const redirected = processor.findSchemaDefinition("AudioInterface", "response");
      expect(redirected).toEqual(audioSchema);

      processor.findSchemaDefinition("Audio", "response");
      const defined = processor.getDefinedSchemas();
      expect(defined["Audio"]).toBeDefined();
      expect(defined["AudioInterface"]).toBeUndefined();

      // Cross-type reference: Response.audio should point to the overridden name "Audio",
      // not the original "AudioInterface"
      const responseSchema = processor.findSchemaDefinition("Response", "response");
      expect(responseSchema.properties?.["audio"]).toEqual({
        $ref: "#/components/schemas/Audio",
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
    it("does not use the TypeScript checker fallback for zod-only schemas", () => {
      type CheckerFallbackHost = {
        resolveTypeWithTypeScriptChecker: (typeName: string, filePath: string) => unknown;
      };
      const checkerSpy = vi.spyOn(
        SchemaProcessor.prototype as unknown as CheckerFallbackHost,
        "resolveTypeWithTypeScriptChecker",
      );
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-only-no-ts-checker-"));
      roots.push(root);
      fs.writeFileSync(
        path.join(root, "schema.ts"),
        [
          "export type Source = {",
          "  id: string;",
          "  name: string;",
          "};",
          "",
          "export type MappedResponse = {",
          "  [Key in keyof Source]: Source[Key];",
          "};",
        ].join("\n"),
      );
      const processor = new SchemaProcessor(root, "zod");

      processor.findSchemaDefinition("MappedResponse", "response");

      expect(checkerSpy).not.toHaveBeenCalled();
    });

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

    it("links cross-file Zod schema via reverse naming convention (issue #131)", () => {
      const converter = new ZodSchemaConverter(
        path.join(process.cwd(), "tests", "fixtures", "zod-cross-file-convention", "schemas"),
      );
      const schema = converter.convertZodSchemaToOpenApi("Slider");

      expect(schema?.type).toBe("object");
      expect(schema?.properties?.pimId).toMatchObject({
        type: "integer",
        description: "Slider PIM ID",
      });
      expect(schema?.properties?.language).toMatchObject({ type: "string" });
      expect(converter.getSchemaReferenceName("Slider")).toBe("Slider");
    });
  });
});
