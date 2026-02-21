import { describe, it, expect } from "vitest";
import { SchemaProcessor } from "../src/lib/schema-processor.js";
import path from "path";

const fixtureBase = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "multi-schema-dir"
);
const typesDir = path.join(fixtureBase, "types");
const schemasDir = path.join(fixtureBase, "schemas");

describe("Multiple schemaDir support", () => {
  it("should find schemas from multiple directories", () => {
    const processor = new SchemaProcessor([typesDir, schemasDir], "typescript");

    const userDef = processor.findSchemaDefinition("User", "response");
    expect(userDef.type).toBe("object");
    expect(userDef.properties?.id).toBeDefined();
    expect(userDef.properties?.name).toBeDefined();
    expect(userDef.properties?.email).toBeDefined();

    const productDef = processor.findSchemaDefinition("Product", "response");
    expect(productDef.type).toBe("object");
    expect(productDef.properties?.id).toBeDefined();
    expect(productDef.properties?.title).toBeDefined();
    expect(productDef.properties?.price).toBeDefined();
  });

  it("should work with a single string (backward compat)", () => {
    const processor = new SchemaProcessor(typesDir, "typescript");

    const userDef = processor.findSchemaDefinition("User", "response");
    expect(userDef.type).toBe("object");
    expect(userDef.properties?.id).toBeDefined();
  });

  it("should handle non-existent directory gracefully", () => {
    const processor = new SchemaProcessor(
      [typesDir, path.join(fixtureBase, "nonexistent")],
      "typescript"
    );

    const userDef = processor.findSchemaDefinition("User", "response");
    expect(userDef.type).toBe("object");
    expect(userDef.properties?.id).toBeDefined();
  });
});
