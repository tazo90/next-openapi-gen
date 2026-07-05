import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › number refinements", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("int() switches type to integer", () => {
    expect(convert("z.number().int()", roots)).toEqual({ type: "integer" });
  });

  it("supports Zod 4 top-level numeric helpers", () => {
    expect(convert("z.int()", roots)).toEqual({ type: "integer" });
    expect(convert("z.int32()", roots)).toEqual({ type: "integer", format: "int32" });
    expect(convert("z.int64()", roots)).toEqual({ type: "integer", format: "int64" });
    expect(convert("z.uint32()", roots)).toEqual({
      type: "integer",
      minimum: 0,
      maximum: 4294967295,
    });
    expect(convert("z.uint64()", roots)).toEqual({
      type: "integer",
      format: "int64",
      minimum: 0,
    });
    expect(convert("z.float32()", roots)).toEqual({ type: "number", format: "float" });
    expect(convert("z.float64()", roots)).toEqual({ type: "number", format: "double" });
  });

  it("applies numeric refinements to top-level z.int()", () => {
    expect(convert("z.int().min(0)", roots)).toEqual({ type: "integer", minimum: 0 });
  });

  it("min/max emit minimum/maximum", () => {
    expect(convert("z.number().min(1).max(10)", roots)).toMatchObject({
      type: "number",
      minimum: 1,
      maximum: 10,
    });
  });

  it("multipleOf()/step() emit multipleOf", () => {
    expect(convert("z.number().multipleOf(0.5)", roots)).toEqual({
      type: "number",
      multipleOf: 0.5,
    });
    expect(convert("z.number().step(2)", roots)).toEqual({
      type: "number",
      multipleOf: 2,
    });
  });

  it("positive() encodes exclusive minimum 0", () => {
    const schema = convert("z.number().positive()", roots);
    expect(schema).toMatchObject({ type: "number", exclusiveMinimum: 0 });
  });

  it("nonnegative() encodes minimum 0", () => {
    expect(convert("z.number().nonnegative()", roots)).toMatchObject({
      type: "number",
      minimum: 0,
    });
  });

  it("negative() encodes exclusive maximum 0", () => {
    const schema = convert("z.number().negative()", roots);
    expect(schema).toMatchObject({ type: "number", exclusiveMaximum: 0 });
  });

  it("nonpositive() encodes maximum 0", () => {
    expect(convert("z.number().nonpositive()", roots)).toMatchObject({
      type: "number",
      maximum: 0,
    });
  });

  it("safe() clamps to IEEE-754 safe-integer range", () => {
    expect(convert("z.number().safe()", roots)).toMatchObject({
      type: "number",
      minimum: -9007199254740991,
      maximum: 9007199254740991,
    });
  });

  it("finite() is a no-op at the schema level", () => {
    expect(convert("z.number().finite()", roots)).toMatchObject({ type: "number" });
  });

  it("combines int() with min/max", () => {
    expect(convert("z.number().int().min(0).max(120)", roots)).toMatchObject({
      type: "integer",
      minimum: 0,
      maximum: 120,
    });
  });

  it("keeps the effective bound when exclusive and inclusive limits overlap", () => {
    expect(convert("z.number().int().positive().safe()", roots)).toEqual({
      type: "integer",
      exclusiveMinimum: 0,
      maximum: 9007199254740991,
    });
  });
});
