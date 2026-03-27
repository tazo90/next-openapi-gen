import { describe, expect, it } from "vitest";

import { SchemaProcessor } from "@next-openapi-gen/schema/typescript/schema-processor.js";
import { copyProjectFixture, getFixturePath } from "../../helpers/test-project.js";

describe("SchemaProcessor import resolution", () => {
  const fixturePath = getFixturePath("import-resolution");

  it("resolves imported functions for ReturnType", () => {
    const project = copyProjectFixture(fixturePath);

    try {
      const processor = new SchemaProcessor(project.root, "typescript");
      const schema = processor.findSchemaDefinition("UserResponse", "");

      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
      expect(schema.properties?.name).toEqual({ type: "string" });
      expect(schema.properties?.email).toEqual({ type: "string" });
    } finally {
      project.cleanup();
    }
  });
});
