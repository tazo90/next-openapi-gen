import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › utility types (standalone)", () => {
  it("Record<string, T> emits additionalProperties", () => {
    expect(resolve("Record<string, number>")).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("Uppercase<'abc'> resolves to 'ABC'", () => {
    expect(resolve("Uppercase<'abc'>")).toEqual({
      type: "string",
      enum: ["ABC"],
    });
  });

  it("Lowercase<'ABC'> resolves to 'abc'", () => {
    expect(resolve("Lowercase<'ABC'>")).toEqual({
      type: "string",
      enum: ["abc"],
    });
  });

  it("Capitalize<'abc'> resolves to 'Abc'", () => {
    expect(resolve("Capitalize<'abc'>")).toEqual({
      type: "string",
      enum: ["Abc"],
    });
  });

  it("Uncapitalize<'Abc'> resolves to 'abc'", () => {
    expect(resolve("Uncapitalize<'Abc'>")).toEqual({
      type: "string",
      enum: ["abc"],
    });
  });

  it("NonNullable<string | null | undefined> resolves to string", () => {
    expect(resolve("NonNullable<string | null | undefined>")).toMatchObject({
      type: "string",
    });
  });

  it("Exclude<'a' | 'b' | 'c', 'b'> drops 'b'", () => {
    const schema = resolve("Exclude<'a' | 'b' | 'c', 'b'>");
    const values = (schema as { enum: string[] }).enum.slice().toSorted();
    expect(values).toEqual(["a", "c"]);
  });

  it("Extract<'a' | 'b' | 'c', 'a' | 'b'> keeps a and b", () => {
    const schema = resolve("Extract<'a' | 'b' | 'c', 'a' | 'b'>");
    const values = (schema as { enum: string[] }).enum.slice().toSorted();
    expect(values).toEqual(["a", "b"]);
  });

  it("Awaited<Promise<string>> resolves to string", () => {
    expect(resolve("Awaited<Promise<string>>")).toMatchObject({ type: "string" });
  });
});
