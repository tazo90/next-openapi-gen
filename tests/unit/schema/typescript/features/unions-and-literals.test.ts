import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › unions and literals", () => {
  it("string-literal union collapses to a string enum", () => {
    expect(resolve(`"a" | "b" | "c"`)).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });

  it("number-literal union collapses to a number enum", () => {
    expect(resolve(`1 | 2 | 3`)).toEqual({
      type: "number",
      enum: [1, 2, 3],
    });
  });

  it("mixed primitive union emits oneOf", () => {
    const schema = resolve(`string | number`);
    expect(schema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ type: "string" }),
        expect.objectContaining({ type: "number" }),
      ]),
    });
  });

  it("T | null sets nullable: true", () => {
    expect(resolve(`string | null`)).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it("T | undefined keeps the base type", () => {
    expect(resolve(`string | undefined`)).toMatchObject({ type: "string" });
  });

  it("nested literal | null", () => {
    const schema = resolve(`"a" | "b" | null`);
    expect(schema).toMatchObject({
      type: "string",
      enum: ["a", "b"],
      nullable: true,
    });
  });

  it("intersection of two object types merges properties", () => {
    const schema = resolve(`{ a: string } & { b: number }`);
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
    });
  });
});
