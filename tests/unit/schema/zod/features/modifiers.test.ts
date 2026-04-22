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
});
