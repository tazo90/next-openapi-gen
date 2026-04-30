import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › modifiers", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it(".optional() on a primitive leaves the schema unchanged at the top level", () => {
    // `.optional()` only affects required tracking on the parent object.
    expect(convert("z.string().optional()", roots)).toMatchObject({ type: "string" });
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
  });

  it(".pipe(schema) merges the piped schema onto the base", () => {
    const schema = convert("z.string().pipe(z.string().email())", roots);
    expect(schema).toMatchObject({ type: "string", format: "email" });
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
  });
});
