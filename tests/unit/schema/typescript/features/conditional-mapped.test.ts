import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › conditional and mapped types", () => {
  it("simple conditional with statically-decidable check", () => {
    const schema = resolve(`string extends string ? number : boolean`);
    expect(schema).toMatchObject({ type: "number" });
  });

  it("conditional with false branch", () => {
    const schema = resolve(`string extends number ? boolean : string`);
    expect(schema).toMatchObject({ type: "string" });
  });

  it("keyof on a literal object becomes a string enum", () => {
    const schema = resolve(`keyof { a: string; b: number }`);
    const values = (schema as { enum: string[] }).enum.slice().toSorted();
    expect(values).toEqual(["a", "b"]);
  });

  it("indexed access T[k] resolves the property type", () => {
    const schema = resolve(`{ a: string; b: number }["a"]`);
    expect(schema).toMatchObject({ type: "string" });
  });
});
