import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › modifiers", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it(".optional() on a primitive leaves the schema unchanged at the top level", () => {
    // `.optional()` only affects required tracking on the parent object.
    expect(convert("z.string().optional()", roots)).toMatchObject({ type: "string" });
  });

  it("z.optional(inner) processes the inner schema", () => {
    expect(convert("z.optional(z.string())", roots)).toMatchObject({ type: "string" });
  });

  it("z.nullable(inner) applies nullable to the inner schema", () => {
    expect(convert("z.nullable(z.string())", roots)).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it("z.nullish(inner) applies nullable to the inner schema", () => {
    expect(convert("z.nullish(z.string())", roots)).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it("functional wrappers affect object required tracking", () => {
    const schema = convert(
      `z.object({
        id: z.string(),
        name: z.optional(z.string()),
        deletedAt: z.nullable(z.iso.datetime()),
      })`,
      roots,
    );
    expect(schema).toMatchObject({
      type: "object",
      required: ["id", "deletedAt"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        deletedAt: { type: "string", format: "date-time", nullable: true },
      },
    });
  });

  it(".nullable() sets nullable: true", () => {
    expect(convert("z.string().nullable()", roots)).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it(".nullish() sets nullable: true", () => {
    expect(convert("z.string().nullish()", roots)).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  it(".default(value) attaches the default", () => {
    expect(convert('z.string().default("hi")', roots)).toMatchObject({
      type: "string",
      default: "hi",
    });
    expect(convert("z.number().default(42)", roots)).toMatchObject({
      type: "number",
      default: 42,
    });
    expect(convert("z.boolean().default(true)", roots)).toMatchObject({
      type: "boolean",
      default: true,
    });
  });

  it(".describe(text) sets the description", () => {
    expect(convert('z.string().describe("name")', roots)).toMatchObject({
      type: "string",
      description: "name",
    });
  });

  it(".describe('@deprecated ...') also sets deprecated", () => {
    const schema = convert('z.string().describe("@deprecated use x instead")', roots);
    expect(schema).toMatchObject({
      type: "string",
      deprecated: true,
      description: "use x instead",
    });
  });

  it(".deprecated() sets deprecated without touching description", () => {
    const schema = convert("z.string().deprecated()", roots);
    expect(schema).toMatchObject({ type: "string", deprecated: true });
    expect((schema as { description?: string }).description).toBeUndefined();
  });

  it(".readonly() sets readOnly: true", () => {
    expect(convert("z.string().readonly()", roots)).toMatchObject({
      type: "string",
      readOnly: true,
    });
  });

  it(".brand<...>() is a no-op at the schema level", () => {
    expect(convert('z.string().brand<"UserId">()', roots)).toMatchObject({
      type: "string",
    });
  });

  it(".transform() preserves the pre-transform schema", () => {
    expect(convert("z.string().transform((v) => v.trim())", roots)).toMatchObject({
      type: "string",
    });
  });

  it(".refine() / .superRefine() preserve the schema", () => {
    expect(convert("z.string().refine((v) => v.length > 0)", roots)).toMatchObject({
      type: "string",
    });
    expect(convert("z.string().superRefine((v, ctx) => {})", roots)).toMatchObject({
      type: "string",
    });
    expect(convert("z.string().check((v) => true)", roots)).toMatchObject({
      type: "string",
    });
  });

  it(".pipe(schema) merges the piped schema onto the base", () => {
    const schema = convert("z.string().pipe(z.string().email())", roots);
    expect(schema).toMatchObject({ type: "string", format: "email" });
  });

  it(".overwrite() and .nonoptional() preserve the value schema", () => {
    expect(convert("z.string().overwrite((v) => v.trim()).nonoptional()", roots)).toMatchObject({
      type: "string",
    });
  });

  it(".describe() with a concrete example sets description", () => {
    expect(convert('z.string().describe("ISO 639-1 language code")', roots)).toMatchObject({
      type: "string",
      description: "ISO 639-1 language code",
    });
  });

  describe(".meta() metadata (Zod v4)", () => {
    it("description maps to schema.description", () => {
      expect(
        convert('z.string().meta({ description: "ISO 639-1 language code" })', roots),
      ).toMatchObject({ type: "string", description: "ISO 639-1 language code" });
    });

    it("examples maps to schema.examples", () => {
      expect(convert('z.string().meta({ examples: ["en", "de"] })', roots)).toMatchObject({
        type: "string",
        examples: ["en", "de"],
      });
    });

    it("description + examples on int().positive() chain", () => {
      expect(
        convert(
          'z.number().int().positive().meta({ description: "PIM ID of the slider", examples: [42, 1337] })',
          roots,
        ),
      ).toMatchObject({
        type: "integer",
        exclusiveMinimum: 0,
        description: "PIM ID of the slider",
        examples: [42, 1337],
      });
    });

    it("description on object property with .meta()", () => {
      expect(
        convert(
          'z.object({ id: z.number().int().positive().meta({ description: "PIM ID", examples: [42, 1337] }) })',
          roots,
        ),
      ).toMatchObject({
        type: "object",
        properties: {
          id: {
            type: "integer",
            exclusiveMinimum: 0,
            description: "PIM ID",
            examples: [42, 1337],
          },
        },
        required: ["id"],
      });
    });

    it("numeric example values are preserved", () => {
      expect(convert("z.number().meta({ examples: [0, 42, 1337] })", roots)).toMatchObject({
        type: "number",
        examples: [0, 42, 1337],
      });
    });

    it("id does not appear in schema body", () => {
      const result = convert('z.string().meta({ id: "Foo", description: "bar" })', roots);
      expect(result).toMatchObject({ type: "string", description: "bar" });
      expect(result).not.toHaveProperty("id");
    });

    it("id only meta does not pollute schema body", () => {
      const result = convert('z.string().meta({ id: "MyComponent" })', roots);
      expect(result).not.toHaveProperty("id");
      expect(result).toMatchObject({ type: "string" });
    });

    it(".meta() followed by .nullish() keeps metadata on outer schema (not nested in anyOf)", () => {
      const result = convert(
        'z.string().describe("Audio title").meta({ example: "Episode 42" }).nullish()',
        roots,
      );
      expect(result).toMatchObject({
        type: "string",
        nullable: true,
        description: "Audio title",
        example: "Episode 42",
      });
      expect(result).not.toHaveProperty("anyOf");
    });

    it(".meta() followed by .nullable() keeps metadata on outer schema (not nested in anyOf)", () => {
      const result = convert(
        'z.number().int().meta({ description: "Count", examples: [42] }).nullable()',
        roots,
      );
      expect(result).toMatchObject({
        type: "integer",
        nullable: true,
        description: "Count",
        examples: [42],
      });
      expect(result).not.toHaveProperty("anyOf");
    });

    it("title and deprecated map from .meta()", () => {
      expect(convert('z.string().meta({ title: "Label", deprecated: true })', roots)).toMatchObject(
        {
          type: "string",
          title: "Label",
          deprecated: true,
        },
      );
    });
  });

  it("z.extend(base, shape) merges object schemas", () => {
    const schema = convert("z.extend(z.object({ name: z.string() }), { age: z.number() })", roots);
    expect(schema).toMatchObject({
      type: "object",
      required: ["name", "age"],
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    });
  });

  it("functional wrappers mirror chain behavior", () => {
    expect(convert("z.readonly(z.string())", roots)).toMatchObject({
      type: "string",
      readOnly: true,
    });
    expect(convert('z.default(z.string(), "hi")', roots)).toMatchObject({
      type: "string",
      default: "hi",
    });
    expect(convert('z.describe(z.number(), "count")', roots)).toMatchObject({
      type: "number",
      description: "count",
    });
    expect(convert('z.catch(z.string(), "fallback")', roots)).toMatchObject({
      type: "string",
      default: "fallback",
    });
  });

  it(".check() with functional minLength/maxLength refinements", () => {
    expect(convert("z.string().check(z.minLength(10), z.maxLength(100))", roots)).toMatchObject({
      type: "string",
      minLength: 10,
      maxLength: 100,
    });
  });

  it("z.union([T, z.undefined()]) treats undefined as optional semantics", () => {
    const schema = convert(
      `z.object({
        name: z.union([z.string(), z.undefined()]),
        id: z.string(),
      })`,
      roots,
    );
    expect(schema).toMatchObject({
      type: "object",
      required: ["id"],
      properties: {
        name: { type: "string" },
        id: { type: "string" },
      },
    });
  });
});
