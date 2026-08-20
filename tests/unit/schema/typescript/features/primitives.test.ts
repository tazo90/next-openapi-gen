import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › primitives", () => {
  const cases: Array<[label: string, source: string, expected: unknown]> = [
    ["string", "string", { type: "string" }],
    ["number", "number", { type: "number" }],
    ["boolean", "boolean", { type: "boolean" }],
    ["null", "null", { type: "null" }],
    ["undefined", "undefined", expect.any(Object)],
    ["void", "void", expect.any(Object)],
    ["any", "any", {}],
    ["unknown", "unknown", {}],
    ["never", "never", expect.any(Object)],
    ["bigint", "bigint", { type: "integer", format: "int64" }],
    ["symbol", "symbol", expect.any(Object)],
    ["object", "object", { type: "object", additionalProperties: true }],
    ["Date", "Date", { type: "string", format: "date-time" }],
    ["File", "File", { type: "string", contentMediaType: "application/octet-stream" }],
    ["Blob", "Blob", { type: "string", contentMediaType: "application/octet-stream" }],
    ["Buffer", "Buffer", { type: "string", contentMediaType: "application/octet-stream" }],
    ["Promise<string>", "Promise<string>", { type: "string" }],
    [
      "readonly string[]",
      "readonly string[]",
      expect.objectContaining({ type: "array", readOnly: true }),
    ],
    ["unique symbol", "unique symbol", expect.any(Object)],
    [
      "keyof { id: string; name: string }",
      "keyof { id: string; name: string }",
      { type: "string", enum: ["id", "name"] },
    ],
  ];

  it.each(cases)("%s", (_label, source, expected) => {
    expect(resolve(source)).toEqual(expected);
  });

  it("string literal", () => {
    expect(resolve(`"hello"`)).toMatchObject({ type: "string", enum: ["hello"] });
  });

  it("number literal", () => {
    expect(resolve("42")).toMatchObject({ type: "number", enum: [42] });
  });

  it("boolean literal (true)", () => {
    expect(resolve("true")).toMatchObject({ type: "boolean", enum: [true] });
  });

  it("covers leftover template, mapped, and binary type-node branches", () => {
    expect(resolve("`fixed`")).toEqual({ type: "string", enum: ["fixed"] });
    expect(resolve("`${'a' | 'b'}-${1 | 2}`")).toEqual({
      type: "string",
      enum: ["a-1", "a-2", "b-1", "b-2"],
    });
    expect(resolve("`${string}-${number}`")).toEqual({
      type: "string",
      pattern: "^.+-\\d+$",
    });
    expect(resolve("`${boolean}`")).toEqual({ type: "string" });
    expect(resolve("{ [K in 'id' | 'name']: string }")).toMatchObject({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    });
    expect(resolve("{ [K in string]: number }")).toEqual({
      type: "object",
      properties: {},
    });
    expect(resolve("ArrayBuffer")).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
    expect(resolve("Uint8Array")).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
    expect(resolve("ReadableStream")).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
  });
});
