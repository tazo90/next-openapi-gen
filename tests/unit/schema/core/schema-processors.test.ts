import path from "node:path";

import { describe, expect, it } from "vitest";

import { CustomSchemaProcessor } from "@workspace/openapi-core/schema/core/custom-schema-processor.js";
import { mergeSchemaDefinitionLayers } from "@workspace/openapi-core/schema/core/schema-definition-processor.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
import { ZodSchemaProcessor } from "@workspace/openapi-core/schema/zod/zod-schema-processor.js";

describe("Schema processors", () => {
  it("merges schema layers in override order", () => {
    expect(
      mergeSchemaDefinitionLayers([
        {
          User: { type: "object" },
        },
        {
          User: { type: "string" },
          Audit: { type: "object" },
        },
      ]),
    ).toEqual({
      User: { type: "string" },
      Audit: { type: "object" },
    });
  });

  it("exposes custom schemas through the custom schema processor", () => {
    const processor = new CustomSchemaProcessor({
      User: {
        type: "object",
      },
    });

    expect(processor.resolveSchema("User")).toEqual({
      type: "object",
    });
    expect(processor.getDefinedSchemas()).toHaveProperty("User");
  });

  it("resolves schemas through the zod schema processor", () => {
    const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "unions");
    const processor = new ZodSchemaProcessor(new ZodSchemaConverter(fixturesDir));

    expect(processor.resolveSchema("StringOrNumberSchema")).toEqual(
      expect.objectContaining({
        oneOf: expect.any(Array),
      }),
    );
  });
});
