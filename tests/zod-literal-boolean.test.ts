import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import { extractJSDocComments, parseTypeScriptFile } from "../src/lib/utils.js";
import traverseModule from "@babel/traverse";
import path from "path";
import fs from "fs";

const traverse = (traverseModule as any).default || traverseModule;

describe("Zod Literal Boolean", () => {
  describe("z.literal(false) should produce enum: [false]", () => {
    it("should convert z.literal(false) with enum in object property", () => {
      const testDir = path.join(process.cwd(), "tests", "fixtures");
      const testFile = path.join(testDir, "literal-boolean-test.ts");

      fs.writeFileSync(
        testFile,
        `
import { z } from "zod";

export const errorSchema = z.object({
  success: z.literal(false),
  error: z.string()
});

export const successSchema = z.object({
  success: z.literal(true),
  data: z.string()
});
        `.trim()
      );

      try {
        const converter = new ZodSchemaConverter(testDir);

        const errorResult = converter.convertZodSchemaToOpenApi("errorSchema");
        expect(errorResult).toBeDefined();
        expect(errorResult.type).toBe("object");
        expect(errorResult.properties.success).toEqual({
          type: "boolean",
          enum: [false],
        });

        const successResult =
          converter.convertZodSchemaToOpenApi("successSchema");
        expect(successResult).toBeDefined();
        expect(successResult.type).toBe("object");
        expect(successResult.properties.success).toEqual({
          type: "boolean",
          enum: [true],
        });
      } finally {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      }
    });

    it("should resolve z.infer type alias with z.literal(false)", () => {
      const testDir = path.join(process.cwd(), "tests", "fixtures");
      const testFile = path.join(testDir, "literal-infer-test.ts");

      fs.writeFileSync(
        testFile,
        `
import { z } from "zod";

export const errorSchema = z.object({
  success: z.literal(false),
  error: z.string()
});

export type ServiceError = z.infer<typeof errorSchema>;
        `.trim()
      );

      try {
        const converter = new ZodSchemaConverter(testDir);

        // Resolve the type alias through z.infer mapping
        const schema =
          converter.convertZodSchemaToOpenApi("ServiceError");
        expect(schema).toBeDefined();
        expect(schema.type).toBe("object");
        expect(schema.properties.success).toEqual({
          type: "boolean",
          enum: [false],
        });
      } finally {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      }
    });
  });

  describe("Multiple @add tags", () => {
    it("should capture all @add tags from JSDoc", () => {
      const code = `
        /**
         * Get user
         * @description Returns user
         * @response 200:UserResponse
         * @add 401:ErrorResponse
         * @add 500:ErrorResponse
         * @openapi
         */
        export async function GET() {
          return { message: 'test' };
        }
      `;

      const ast = parseTypeScriptFile(code);
      let dataTypes: any;

      traverse(ast, {
        ExportNamedDeclaration: (nodePath: any) => {
          dataTypes = extractJSDocComments(nodePath);
        },
      });

      expect(dataTypes).toBeDefined();
      expect(dataTypes.addResponses).toBeDefined();
      // Should contain BOTH 401 and 500
      expect(dataTypes.addResponses).toContain("401:ErrorResponse");
      expect(dataTypes.addResponses).toContain("500:ErrorResponse");
    });
  });
});
