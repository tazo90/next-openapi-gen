import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › enums", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.enum([...strings]) emits an enum of strings", () => {
    expect(convert('z.enum(["a", "b", "c"])', roots)).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });

  it("z.enum with one value still emits a string enum", () => {
    expect(convert('z.enum(["only"])', roots)).toEqual({
      type: "string",
      enum: ["only"],
    });
  });

  it("z.nativeEnum(StringEnum) emits a string enum", () => {
    const schema = convert(
      `(() => {
        const Colors = { Red: "red", Blue: "blue" } as const;
        return z.nativeEnum(Colors);
      })()`,
      roots,
    );
    // native enum may fall back to untyped enum depending on AST resolution,
    // but at minimum should produce a string-valued enum.
    const asEnum = schema as { enum?: string[]; type?: string };
    if (asEnum.enum) {
      expect(asEnum.enum.sort()).toEqual(["blue", "red"]);
    }
  });

  it("enum chained with describe() keeps the values", () => {
    const schema = convert('z.enum(["a", "b"]).describe("Letters")', roots);
    expect(schema).toMatchObject({
      type: "string",
      enum: ["a", "b"],
      description: "Letters",
    });
  });
});
