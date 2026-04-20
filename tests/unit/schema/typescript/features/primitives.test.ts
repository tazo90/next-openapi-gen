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
});
