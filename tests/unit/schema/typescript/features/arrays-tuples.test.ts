import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › arrays and tuples", () => {
  it("string[] emits an array of strings", () => {
    expect(resolve("string[]")).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("Array<T> emits an array of T", () => {
    const schema = resolve("Array<number>");
    expect(schema).toMatchObject({
      type: "array",
      items: { type: "number" },
    });
  });

  it("readonly T[] still emits an array", () => {
    const schema = resolve("readonly string[]");
    expect(schema).toMatchObject({ type: "array", items: { type: "string" } });
  });

  it("empty tuple", () => {
    const schema = resolve("[]");
    expect(schema).toMatchObject({ type: "array" });
  });

  it("fixed-length tuple [string, number]", () => {
    const schema = resolve("[string, number]");
    expect(schema).toMatchObject({
      type: "array",
      minItems: 2,
      maxItems: 2,
    });
  });

  it("tuple with rest element [string, ...number[]]", () => {
    const schema = resolve("[string, ...number[]]");
    expect(schema).toMatchObject({ type: "array", minItems: 1 });
    expect((schema as { maxItems?: number }).maxItems).toBeUndefined();
  });

  it("named tuple members [id: string, count: number]", () => {
    const schema = resolve("[id: string, count: number]");
    expect(schema).toMatchObject({
      type: "array",
      minItems: 2,
      maxItems: 2,
    });
  });

  it("indexes into tuples, arrays, and object properties", () => {
    expect(resolve("[string, number][0]")).toEqual({ type: "string" });
    expect(resolve("[string, number][5]")).toEqual({ type: "object" });
    expect(resolve("string[][0]")).toEqual({ type: "string" });
    expect(resolve('{ id: string; name: number }["id"]')).toEqual({ type: "string" });
    expect(resolve('{ id: string }["missing"]')).toEqual({ type: "object" });
  });
});
