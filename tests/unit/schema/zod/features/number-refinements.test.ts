import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › number refinements", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("int() switches type to integer", () => {
    expect(convert("z.number().int()", roots)).toEqual({ type: "integer" });
  });

  it("min/max emit minimum/maximum", () => {
    expect(convert("z.number().min(1).max(10)", roots)).toMatchObject({
      type: "number",
      minimum: 1,
      maximum: 10,
    });
  });

  it("positive() encodes exclusive minimum 0", () => {
    const schema = convert("z.number().positive()", roots);
    expect(schema).toMatchObject({ type: "number", minimum: 0 });
  });

  it("nonnegative() encodes minimum 0", () => {
    expect(convert("z.number().nonnegative()", roots)).toMatchObject({
      type: "number",
      minimum: 0,
    });
  });

  it("negative() encodes exclusive maximum 0", () => {
    const schema = convert("z.number().negative()", roots);
    expect(schema).toMatchObject({ type: "number", maximum: 0 });
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
});
