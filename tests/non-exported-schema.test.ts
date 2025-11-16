import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";
import fs from "fs";

describe("Non-exported nested schemas", () => {
  it("should handle non-exported schemas referenced in exported schemas", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "non-exported-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

const innerSchema = z.object({ 
  foo: z.string(),
  bar: z.number() 
});

export const ResponseEnvelope = z.object({ 
  data: innerSchema 
});
    `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);
      const envelopeSchema = converter.convertZodSchemaToOpenApi("ResponseEnvelope");

      expect(envelopeSchema).toBeDefined();
      expect(envelopeSchema.type).toBe("object");
      expect(envelopeSchema.properties.data).toBeDefined();

      // Should create a $ref even for non-exported schema
      expect(envelopeSchema.properties.data.$ref).toBe(
        "#/components/schemas/innerSchema"
      );

      // Verify the non-exported schema was also processed
      const schemas = converter.getProcessedSchemas();
      expect(schemas.innerSchema).toBeDefined();
      expect(schemas.innerSchema.properties.foo).toBeDefined();
      expect(schemas.innerSchema.properties.bar).toBeDefined();
      
      // Should not have duplicate required fields
      expect(envelopeSchema.required).toEqual(["data"]);
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});
