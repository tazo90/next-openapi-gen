import { describe, expect, it, vi } from "vitest";

import { ZodSchemaProcessor } from "@next-openapi-gen/schema/zod/zod-schema-processor.js";

describe("ZodSchemaProcessor", () => {
  it("delegates schema resolution and exposes the underlying converter", () => {
    const converter = {
      getProcessedSchemas: vi.fn(() => ({
        UserSchema: { type: "object" },
      })),
      convertZodSchemaToOpenApi: vi.fn(() => ({
        type: "string",
      })),
    };
    const processor = new ZodSchemaProcessor(converter as never);

    expect(processor.kind).toBe("zod");
    expect(processor.getDefinedSchemas()).toEqual({
      UserSchema: { type: "object" },
    });
    expect(processor.resolveSchema("UserSchema")).toEqual({
      type: "string",
    });
    expect(processor.getConverter()).toBe(converter);
  });
});
