import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";
import fs from "fs";

describe("Zod .extend() Method Support", () => {
  it("should properly handle .extend() with schema references", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "extend-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

export const BaseSchema = z.object({
  id: z.string().uuid().describe("Identifier"),
});

export const ExtendedSchema = BaseSchema.extend({
  name: z.string().describe("Name"),
});
      `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      // Convert the base schema
      const baseSchema = converter.convertZodSchemaToOpenApi("BaseSchema");
      expect(baseSchema).toBeDefined();
      expect(baseSchema.type).toBe("object");
      expect(baseSchema.properties).toBeDefined();
      expect(baseSchema.properties.id).toBeDefined();
      expect(baseSchema.properties.id.type).toBe("string");
      expect(baseSchema.properties.id.format).toBe("uuid");
      expect(baseSchema.properties.id.description).toBe("Identifier");
      expect(baseSchema.required).toEqual(["id"]);

      // Convert the extended schema
      const extendedSchema =
        converter.convertZodSchemaToOpenApi("ExtendedSchema");
      expect(extendedSchema).toBeDefined();
      expect(extendedSchema.type).toBe("object");
      expect(extendedSchema.properties).toBeDefined();

      // Should have BOTH id and name properties
      expect(extendedSchema.properties.id).toBeDefined();
      expect(extendedSchema.properties.id.type).toBe("string");
      expect(extendedSchema.properties.id.format).toBe("uuid");
      expect(extendedSchema.properties.id.description).toBe("Identifier");

      expect(extendedSchema.properties.name).toBeDefined();
      expect(extendedSchema.properties.name.type).toBe("string");
      expect(extendedSchema.properties.name.description).toBe("Name");

      // Both should be required, with no duplicates
      expect(extendedSchema.required).toBeDefined();
      expect(extendedSchema.required.length).toBe(2);
      expect(extendedSchema.required).toContain("id");
      expect(extendedSchema.required).toContain("name");
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should handle nested schema references in objects", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "nested-ref-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

export const BaseSchema = z.object({
  id: z.string().uuid().describe("Identifier"),
});

export const NestedSchema = z.object({
  foo: BaseSchema,
  bar: z.string(),
});
      `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      // Convert the nested schema
      const nestedSchema = converter.convertZodSchemaToOpenApi("NestedSchema");
      expect(nestedSchema).toBeDefined();
      expect(nestedSchema.type).toBe("object");
      expect(nestedSchema.properties).toBeDefined();

      // foo should be a $ref to BaseSchema, not an inline object
      expect(nestedSchema.properties.foo).toBeDefined();
      expect(nestedSchema.properties.foo.$ref).toBe(
        "#/components/schemas/BaseSchema"
      );
      expect(nestedSchema.properties.foo.type).toBeUndefined();

      // bar should be a regular string
      expect(nestedSchema.properties.bar).toBeDefined();
      expect(nestedSchema.properties.bar.type).toBe("string");

      // Both should be required, with no duplicates
      expect(nestedSchema.required).toBeDefined();
      expect(nestedSchema.required.length).toBe(2);
      expect(nestedSchema.required).toContain("foo");
      expect(nestedSchema.required).toContain("bar");

      // BaseSchema should be in processed schemas
      const schemas = converter.getProcessedSchemas();
      expect(schemas.BaseSchema).toBeDefined();
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should handle multiple levels of .extend()", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "multi-extend-test.ts");
    fs.writeFileSync(
      testFile,
      `
import { z } from "zod";

export const BaseSchema = z.object({
  id: z.string().uuid(),
});

export const ExtendedSchema = BaseSchema.extend({
  name: z.string(),
});

export const DoubleExtendedSchema = ExtendedSchema.extend({
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});
      `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      // Convert the double extended schema
      const doubleExtendedSchema = converter.convertZodSchemaToOpenApi(
        "DoubleExtendedSchema"
      );
      expect(doubleExtendedSchema).toBeDefined();
      expect(doubleExtendedSchema.type).toBe("object");
      expect(doubleExtendedSchema.properties).toBeDefined();

      // Should have ALL properties from base, extended, and double extended
      expect(doubleExtendedSchema.properties.id).toBeDefined();
      expect(doubleExtendedSchema.properties.id.type).toBe("string");
      expect(doubleExtendedSchema.properties.id.format).toBe("uuid");

      expect(doubleExtendedSchema.properties.name).toBeDefined();
      expect(doubleExtendedSchema.properties.name.type).toBe("string");

      expect(doubleExtendedSchema.properties.email).toBeDefined();
      expect(doubleExtendedSchema.properties.email.type).toBe("string");
      expect(doubleExtendedSchema.properties.email.format).toBe("email");

      expect(doubleExtendedSchema.properties.age).toBeDefined();
      expect(doubleExtendedSchema.properties.age.type).toBe("integer");

      // Required should have id, name, email (not age because it's optional)
      expect(doubleExtendedSchema.required).toBeDefined();
      expect(doubleExtendedSchema.required.length).toBe(3);
      expect(doubleExtendedSchema.required).toContain("id");
      expect(doubleExtendedSchema.required).toContain("name");
      expect(doubleExtendedSchema.required).toContain("email");
      expect(doubleExtendedSchema.required).not.toContain("age");

      // No duplicates in required array
      const uniqueRequired = [...new Set(doubleExtendedSchema.required)];
      expect(doubleExtendedSchema.required.length).toBe(uniqueRequired.length);
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should not create duplicate required fields", () => {
    const testDir = path.join(process.cwd(), "tests", "fixtures");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, "no-duplicates-test.ts");
    fs.writeFileSync(
      testFile,
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
      `.trim()
    );

    try {
      const converter = new ZodSchemaConverter(testDir);

      const extendedSchema =
        converter.convertZodSchemaToOpenApi("ExtendedSchema");
      expect(extendedSchema).toBeDefined();

      // Check required array has no duplicates
      expect(extendedSchema.required).toBeDefined();
      const uniqueRequired = [...new Set(extendedSchema.required)];
      expect(extendedSchema.required.length).toBe(uniqueRequired.length);

      // Should have exactly 4 required fields
      expect(extendedSchema.required.length).toBe(4);
      expect(extendedSchema.required).toContain("id");
      expect(extendedSchema.required).toContain("createdAt");
      expect(extendedSchema.required).toContain("name");
      expect(extendedSchema.required).toContain("updatedAt");
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});
