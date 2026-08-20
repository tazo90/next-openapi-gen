import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › advanced types", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.promise(T) unwraps to T for documentation purposes", () => {
    const schema = convert("z.promise(z.string())", roots);
    expect(schema).toMatchObject({ type: "string" });
  });

  it("z.function(...) produces a generic object/function placeholder", () => {
    const schema = convert("z.function().args(z.string()).returns(z.number())", roots);
    // We only assert that it doesn't throw and produces *some* schema.
    expect(schema).toBeDefined();
  });

  it("z.instanceof(Date) maps to a string date-time", () => {
    const schema = convert("z.instanceof(Date)", roots);
    expect(schema).toMatchObject({ type: "string", format: "date-time" });
  });

  it("z.preprocess(fn, schema) forwards to the inner schema", () => {
    const schema = convert("z.preprocess((v) => Number(v), z.number().int())", roots);
    expect(schema).toMatchObject({ type: "integer" });
  });

  it("z.lazy(() => Schema) resolves to the inner schema", () => {
    const schema = convert("z.lazy(() => z.object({ a: z.string() }))", roots);
    expect(schema).toMatchObject({ type: "object" });
  });

  it("z.custom<T>() degrades to a generic object schema", () => {
    const schema = convert("z.custom<string>()", roots);
    expect(schema).toBeDefined();
  });

  it("z.string().brand<'UserId'>() is transparent", () => {
    const schema = convert('z.string().uuid().brand<"UserId">()', roots);
    expect(schema).toMatchObject({ type: "string", format: "uuid" });
  });

  it("z.bigint() emits integer with format=int64", () => {
    const schema = convert("z.bigint()", roots);
    expect(schema).toMatchObject({ type: "integer", format: "int64" });
  });

  it("z.date() emits string date-time", () => {
    expect(convert("z.date()", roots)).toMatchObject({
      type: "string",
      format: "date-time",
    });
  });

  it("covers remaining primitive and collection helpers through the converter", () => {
    expect(convert("z.float32()", roots)).toMatchObject({ type: "number", format: "float" });
    expect(convert("z.float64()", roots)).toMatchObject({ type: "number", format: "double" });
    expect(convert("z.int32()", roots)).toMatchObject({ type: "integer", format: "int32" });
    expect(convert("z.uint32()", roots)).toMatchObject({ type: "integer", minimum: 0 });
    expect(convert("z.uint64()", roots)).toMatchObject({ type: "integer", format: "int64" });
    expect(convert("z.file()", roots)).toMatchObject({ type: "string" });
    expect(convert("z.nan()", roots)).toMatchObject({ type: "number" });
    expect(convert("z.void()", roots)).toMatchObject({ type: "null" });
    expect(convert("z.never()", roots)).toMatchObject({ not: {} });
    expect(convert("z.set(z.string())", roots)).toMatchObject({
      type: "array",
      uniqueItems: true,
    });
    expect(convert("z.map(z.string(), z.number())", roots)).toMatchObject({
      type: "object",
    });
    expect(convert("z.partialRecord(z.string(), z.boolean())", roots)).toMatchObject({
      type: "object",
    });
    expect(convert("z.templateLiteral(['id-', z.string()])", roots)).toMatchObject({
      type: "string",
      pattern: expect.stringContaining("id-"),
    });
    expect(convert("z.strictObject({ id: z.string() })", roots)).toMatchObject({
      additionalProperties: false,
    });
    expect(convert("z.looseObject({ id: z.string() })", roots)).toMatchObject({
      additionalProperties: true,
    });
  });

  it("z.null() and z.undefined() map to null-typed schemas", () => {
    expect(convert("z.null()", roots)).toMatchObject({ type: "null" });
    const undef = convert("z.undefined()", roots);
    expect(undef).toBeDefined();
  });
});
