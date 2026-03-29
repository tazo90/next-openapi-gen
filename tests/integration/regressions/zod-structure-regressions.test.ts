import traverseModule from "@babel/traverse";
import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

const traverse = traverseModule.default || traverseModule;

function createTestDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Zod structure regressions", () => {
  it("creates refs for nested and non-exported schemas in envelopes", () => {
    const testDir = createTestDir("nxog-envelope-");
    fs.writeFileSync(
      path.join(testDir, "schema.ts"),
      `
        import { z } from "zod";

        const innerSchema = z.object({
          foo: z.string(),
          bar: z.number(),
        });

        export const ResponseEnvelope = z.object({
          data: innerSchema,
        });
      `.trim(),
    );

    try {
      const converter = new ZodSchemaConverter(testDir);
      const envelopeSchema = converter.convertZodSchemaToOpenApi("ResponseEnvelope");

      expect(envelopeSchema?.properties?.data?.$ref).toBe("#/components/schemas/innerSchema");
      expect(converter.getProcessedSchemas().innerSchema).toBeDefined();
      expect(envelopeSchema?.required).toEqual(["data"]);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("merges base and extended zod objects without duplicating required fields", () => {
    const testDir = createTestDir("nxog-extend-");
    fs.writeFileSync(
      path.join(testDir, "schema.ts"),
      `
        import { z } from "zod";

        export const BaseSchema = z.object({
          id: z.string().uuid(),
          createdAt: z.string(),
        });

        export const ExtendedSchema = BaseSchema.extend({
          name: z.string(),
          updatedAt: z.string(),
        });
      `.trim(),
    );

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("ExtendedSchema");

      expect(schema?.properties?.id?.format).toBe("uuid");
      expect(schema?.properties?.name?.type).toBe("string");
      expect(schema?.required).toEqual(["id", "createdAt", "name", "updatedAt"]);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("preserves boolean literal enums and multiple @add tags", () => {
    const testDir = createTestDir("nxog-literal-boolean-");
    fs.writeFileSync(
      path.join(testDir, "schema.ts"),
      `
        import { z } from "zod";

        export const errorSchema = z.object({
          success: z.literal(false),
          error: z.string(),
        });

        export type ServiceError = z.infer<typeof errorSchema>;
      `.trim(),
    );

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("ServiceError");

      expect(schema?.properties?.success).toEqual({
        type: "boolean",
        enum: [false],
      });

      const ast = parseTypeScriptFile(`
        /**
         * @response 200:UserResponse
         * @add 401:ErrorResponse
         * @add 500:ErrorResponse
         */
        export async function GET() {}
      `);

      let dataTypes: ReturnType<typeof extractJSDocComments> | undefined;
      traverse(ast, {
        ExportNamedDeclaration: (nodePath) => {
          dataTypes = extractJSDocComments(nodePath);
        },
      });

      expect(dataTypes?.addResponses).toBe("401:ErrorResponse,500:ErrorResponse");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
