import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › collections", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.array(T) emits an array with items", () => {
    expect(convert("z.array(z.string())", roots)).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("z.array(...).min/max/length emit min/max/items constraints", () => {
    expect(convert("z.array(z.string()).min(1)", roots)).toMatchObject({
      type: "array",
      minItems: 1,
    });
    expect(convert("z.array(z.string()).max(5)", roots)).toMatchObject({
      type: "array",
      maxItems: 5,
    });
    expect(convert("z.array(z.string()).length(3)", roots)).toMatchObject({
      type: "array",
      minItems: 3,
      maxItems: 3,
    });
  });

  it("z.array(...).nonempty() implies minItems=1", () => {
    expect(convert("z.array(z.string()).nonempty()", roots)).toMatchObject({
      type: "array",
      minItems: 1,
    });
  });

  it("z.tuple([a, b]) emits fixed-length prefixItems/items", () => {
    const schema = convert("z.tuple([z.string(), z.number()])", roots);
    expect(schema).toMatchObject({
      type: "array",
      minItems: 2,
      maxItems: 2,
    });
    const prefix =
      (schema as { prefixItems?: unknown[]; items?: unknown[] }).prefixItems ??
      (schema as { items?: unknown[] }).items;
    expect(prefix).toEqual([{ type: "string" }, { type: "number" }]);
  });

  it("z.tuple([...]).rest(schema) relaxes maxItems and sets a rest items schema", () => {
    const schema = convert("z.tuple([z.string()]).rest(z.number())", roots);
    expect(schema).toMatchObject({ type: "array", minItems: 1 });
    expect((schema as { maxItems?: number }).maxItems).toBeUndefined();
  });

  it("z.record(valueSchema) emits type=object with additionalProperties", () => {
    expect(convert("z.record(z.number())", roots)).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("z.record(keyEnum, value) preserves the value schema as additionalProperties", () => {
    const schema = convert('z.record(z.enum(["a", "b"]), z.string())', roots);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: { type: "string" },
    });
  });

  it("z.set(T) / z.map(K, V) degrade gracefully to array / object schemas", () => {
    const setSchema = convert("z.set(z.string())", roots);
    expect(setSchema).toMatchObject({ type: "array", items: { type: "string" } });
    expect((setSchema as { uniqueItems?: boolean }).uniqueItems).toBe(true);

    const mapSchema = convert("z.map(z.string(), z.number())", roots);
    expect(mapSchema).toMatchObject({ type: "object" });
  });
});
