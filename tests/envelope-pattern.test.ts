import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";
import fs from "fs";

describe("Envelope Pattern with Nested Schema References", () => {
  it("should create $ref for nested schemas in envelope objects", () => {
    // Create a temporary test file
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "envelope-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

export const UserResponseEnvelope = z.object({
  data: userSchema,
});
    `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      // Convert the envelope schema
      const envelopeSchema = converter.convertZodSchemaToOpenApi(
        "UserResponseEnvelope"
      );

      expect(envelopeSchema).toBeDefined();
      expect(envelopeSchema.type).toBe("object");
      expect(envelopeSchema.properties).toBeDefined();
      expect(envelopeSchema.properties.data).toBeDefined();

      // The key fix: data property should have a $ref, not type: "object"
      expect(envelopeSchema.properties.data.$ref).toBe(
        "#/components/schemas/userSchema"
      );
      expect(envelopeSchema.properties.data.type).toBeUndefined();

      // Check required fields - should only have "data" once
      expect(envelopeSchema.required).toBeDefined();
      expect(envelopeSchema.required).toEqual(["data"]);
      expect(envelopeSchema.required.length).toBe(1);

      // Verify the nested schema was also processed correctly
      const schemas = converter.getProcessedSchemas();
      expect(schemas.userSchema).toBeDefined();
      expect(schemas.userSchema.type).toBe("object");
      expect(schemas.userSchema.properties).toHaveProperty("id");
      expect(schemas.userSchema.properties).toHaveProperty("name");
      expect(schemas.userSchema.properties).toHaveProperty("email");
      expect(schemas.userSchema.properties).toHaveProperty("createdAt");
    } finally {
      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should handle multiple levels of nested schemas", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "nested-envelope-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: addressSchema,
});

export const UserResponseEnvelope = z.object({
  data: userSchema,
  meta: z.object({
    timestamp: z.string(),
  }),
});
    `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      const envelopeSchema = converter.convertZodSchemaToOpenApi(
        "UserResponseEnvelope"
      );

      expect(envelopeSchema).toBeDefined();

      // Check the data property has a proper reference
      expect(envelopeSchema.properties.data.$ref).toBe(
        "#/components/schemas/userSchema"
      );

      // Check required array has no duplicates
      const requiredSet = new Set(envelopeSchema.required);
      expect(envelopeSchema.required.length).toBe(requiredSet.size);

      // Verify all nested schemas were processed
      const schemas = converter.getProcessedSchemas();
      expect(schemas.userSchema).toBeDefined();
      expect(schemas.addressSchema).toBeDefined();

      // Verify userSchema also has proper reference to addressSchema
      expect(schemas.userSchema.properties.address.$ref).toBe(
        "#/components/schemas/addressSchema"
      );
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should handle optional nested schemas", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "optional-envelope-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

export const metaSchema = z.object({
  page: z.number(),
  total: z.number(),
});

export const DataEnvelope = z.object({
  data: z.string(),
  meta: metaSchema.optional(),
});
    `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      const envelopeSchema = converter.convertZodSchemaToOpenApi("DataEnvelope");

      expect(envelopeSchema).toBeDefined();

      // Check required array - data should be required, meta should not
      expect(envelopeSchema.required).toContain("data");
      expect(envelopeSchema.required).not.toContain("meta");

      // meta should still have a $ref even though it's optional
      expect(envelopeSchema.properties.meta).toBeDefined();
      expect(envelopeSchema.properties.meta.allOf).toBeDefined();
      expect(envelopeSchema.properties.meta.allOf[0].$ref).toBe(
        "#/components/schemas/metaSchema"
      );
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});
