import path from "path";

import { describe, expect, it } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";

const fixtureBase = path.join(process.cwd(), "tests", "fixtures", "multi-schema-dir");
const typesDir = path.join(fixtureBase, "types");
const schemasDir = path.join(fixtureBase, "schemas");

describe("Multiple schemaDir support", () => {
  it("finds schemas from multiple directories", () => {
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

  it("keeps backward compatibility with a single schemaDir string", () => {
    const processor = new SchemaProcessor(typesDir, "typescript");

    const userDef = processor.findSchemaDefinition("User", "response");
    expect(userDef.type).toBe("object");
    expect(userDef.properties?.id).toBeDefined();
  });

  it("handles non-existent directories gracefully", () => {
    const processor = new SchemaProcessor(
      [typesDir, path.join(fixtureBase, "nonexistent")],
      "typescript",
    );

    const userDef = processor.findSchemaDefinition("User", "response");
    expect(userDef.type).toBe("object");
    expect(userDef.properties?.id).toBeDefined();
  });
});
