import { describe, it, expect } from "vitest";
import { SchemaProcessor } from "../src/lib/schema-processor.js";
import path from "path";

describe("Product Example - Real Test", () => {
  it("should resolve ProductByIdResponse with types dir only", () => {
    const typesDir = path.join(process.cwd(), "tests", "fixtures", "product-example", "types");
    const processor = new SchemaProcessor(typesDir, "typescript");

    const schema = processor.findSchemaDefinition("ProductByIdResponse", "");

    console.log("ProductByIdResponse schema:", JSON.stringify(schema, null, 2));

    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });

  it("should resolve ProductByIdResponse with root dir", () => {
    const rootDir = path.join(process.cwd(), "tests", "fixtures", "product-example");
    const processor = new SchemaProcessor(rootDir, "typescript");

    const schema = processor.findSchemaDefinition("ProductByIdResponse", "");

    console.log("ProductByIdResponse schema (root):", JSON.stringify(schema, null, 2));

    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });
});
