import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert, convertFromFile } from "./_helpers.js";

describe("Zod features › unions and intersections", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.union([a, b]) emits anyOf", () => {
    const schema = convert("z.union([z.string(), z.number()])", roots);
    expect(schema).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("z.union over homogeneous string literals collapses to an enum", () => {
    const schema = convert('z.union([z.literal("a"), z.literal("b"), z.literal("c")])', roots);
    expect(schema).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });

  it("z.union over mixed types stays as anyOf", () => {
    const schema = convert('z.union([z.literal("a"), z.number(), z.boolean()])', roots);
    expect(schema).toMatchObject({
      anyOf: expect.arrayContaining([
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

  it("z.discriminatedUnion of named schemas maps each value to its component", () => {
    // Named variants are emitted as `$ref`s, which carry no properties: the literal must
    // come from the referenced component, or clients key the union by component name.
    const schema = convertFromFile(
      {
        "shapes.ts": `
          import { z } from "zod";
          export const circleSchema = z.object({ kind: z.literal("circle"), radius: z.number() });
          export const squareSchema = z
            .object({ kind: z.literal("square"), side: z.number() })
            .meta({ id: "Square" });
          export const shapeSchema = z.discriminatedUnion("kind", [circleSchema, squareSchema]);
        `,
      },
      { file: "shapes.ts", exportName: "shapeSchema" },
      roots,
    );
    expect(schema).toEqual({
      type: "object",
      discriminator: {
        propertyName: "kind",
        mapping: {
          circle: "#/components/schemas/circleSchema",
          square: "#/components/schemas/Square",
        },
      },
      oneOf: [
        { $ref: "#/components/schemas/circleSchema" },
        { $ref: "#/components/schemas/Square" },
      ],
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

  it(".or() produces anyOf with the alternative", () => {
    const schema = convert("z.string().or(z.number())", roots);
    expect(schema).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
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

  it("z.union over mixed integer and float literals stays as anyOf", () => {
    const schema = convert("z.union([z.literal(1), z.literal(2.5)])", roots);
    expect(schema).toMatchObject({
      anyOf: expect.arrayContaining([
        expect.objectContaining({ type: "integer", enum: [1] }),
        expect.objectContaining({ type: "number", enum: [2.5] }),
      ]),
    });
  });

  it("z.union over overlapping string formats emits anyOf", () => {
    const schema = convert("z.union([z.cuid2(), z.uuid()])", roots);
    expect(schema).toEqual({
      anyOf: [
        { type: "string", pattern: "^[0-9a-z]+$" },
        { type: "string", format: "uuid" },
      ],
    });
  });
});
