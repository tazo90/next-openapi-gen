import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › unions and intersections", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.union([a, b]) emits oneOf", () => {
    const schema = convert("z.union([z.string(), z.number()])", roots);
    expect(schema).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("z.union over homogeneous string literals collapses to an enum", () => {
    const schema = convert('z.union([z.literal("a"), z.literal("b"), z.literal("c")])', roots);
    expect(schema).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });

  it("z.union over mixed types stays as oneOf", () => {
    const schema = convert('z.union([z.literal("a"), z.number(), z.boolean()])', roots);
    expect(schema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ enum: ["a"] }),
        expect.objectContaining({ type: "number" }),
        expect.objectContaining({ type: "boolean" }),
      ]),
    });
  });

  it("z.discriminatedUnion on a string key", () => {
    const schema = convert(
      `z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), a: z.string() }),
        z.object({ kind: z.literal("b"), b: z.number() }),
      ])`,
      roots,
    );
    expect(schema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ type: "object" }),
        expect.objectContaining({ type: "object" }),
      ]),
    });
    expect((schema as { discriminator?: unknown }).discriminator).toMatchObject({
      propertyName: "kind",
    });
  });

  it("z.intersection([a, b]) emits allOf", () => {
    const schema = convert(
      "z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))",
      roots,
    );
    expect(schema).toMatchObject({
      allOf: [
        expect.objectContaining({ type: "object" }),
        expect.objectContaining({ type: "object" }),
      ],
    });
  });

  it(".or() produces oneOf with the alternative", () => {
    const schema = convert("z.string().or(z.number())", roots);
    expect(schema).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it(".and() produces allOf with the additional schema", () => {
    const schema = convert("z.object({ a: z.string() }).and(z.object({ b: z.number() }))", roots);
    expect(schema).toMatchObject({
      allOf: [
        expect.objectContaining({ type: "object" }),
        expect.objectContaining({ type: "object" }),
      ],
    });
  });

  it("z.literal(1) emits type integer", () => {
    const schema = convert("z.literal(1)", roots);
    expect(schema).toEqual({ type: "integer", enum: [1] });
  });

  it("z.literal(1.5) emits type number", () => {
    const schema = convert("z.literal(1.5)", roots);
    expect(schema).toEqual({ type: "number", enum: [1.5] });
  });

  it("z.union over homogeneous integer literals collapses to an integer enum", () => {
    const schema = convert("z.union([z.literal(1), z.literal(2), z.literal(3)])", roots);
    expect(schema).toEqual({ type: "integer", enum: [1, 2, 3] });
  });

  it("z.union over mixed integer and float literals stays as oneOf", () => {
    const schema = convert("z.union([z.literal(1), z.literal(2.5)])", roots);
    expect(schema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ type: "integer", enum: [1] }),
        expect.objectContaining({ type: "number", enum: [2.5] }),
      ]),
    });
  });
});
