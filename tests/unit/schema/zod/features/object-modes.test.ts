import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › object modes", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  const base = `z.object({ id: z.string(), name: z.string().optional() })`;

  it("default strip mode emits type=object with properties and required", () => {
    expect(convert(base, roots)).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id"],
    });
  });

  it("strict() disallows additional properties", () => {
    const schema = convert(`${base}.strict()`, roots);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("passthrough() allows any additional properties", () => {
    const schema = convert(`${base}.passthrough()`, roots);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: true,
    });
  });

  it("catchall(Schema) types additional properties", () => {
    const schema = convert(`${base}.catchall(z.number())`, roots);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("z.strictObject() emits additionalProperties: false", () => {
    const schema = convert(
      `z.strictObject({ id: z.string(), name: z.string().optional() })`,
      roots,
    );
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    });
  });

  it("z.strictObject() without arguments emits plain object", () => {
    const schema = convert(`z.strictObject({})`, roots);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("strip() is a no-op (explicit default)", () => {
    const schema = convert(`${base}.strip()`, roots);
    expect(schema).toMatchObject({ type: "object" });
    expect((schema as { additionalProperties?: unknown }).additionalProperties).toBeUndefined();
  });

  it("extend() adds new properties", () => {
    const schema = convert(`${base}.extend({ age: z.number() })`, roots);
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        age: { type: "number" },
      },
    });
    expect((schema as { required: string[] }).required).toEqual(expect.arrayContaining(["age"]));
  });

  it("merge() inlines the other object's shape", () => {
    const schema = convert(`${base}.merge(z.object({ email: z.string().email() }))`, roots);
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
      },
    });
  });

  it("pick() keeps only listed properties", () => {
    const schema = convert(`${base}.pick({ id: true })`, roots);
    expect(schema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect((schema as { properties: Record<string, unknown> }).properties.name).toBeUndefined();
  });

  it("omit() removes listed properties", () => {
    const schema = convert(`${base}.omit({ id: true })`, roots);
    expect(schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
    });
    expect((schema as { properties: Record<string, unknown> }).properties.id).toBeUndefined();
  });

  it("partial() removes the required array", () => {
    const schema = convert(`${base}.partial()`, roots);
    expect(schema).toMatchObject({ type: "object" });
    expect((schema as { required?: string[] }).required).toBeUndefined();
  });

  it("required() marks every property required", () => {
    const schema = convert(`${base}.required()`, roots);
    expect(schema).toMatchObject({ type: "object" });
    expect((schema as { required: string[] }).required.toSorted()).toEqual(["id", "name"]);
  });

  it("deepPartial() strips required arrays recursively", () => {
    const schema = convert(
      `z.object({ inner: z.object({ a: z.string() }), b: z.number() }).deepPartial()`,
      roots,
    );
    expect((schema as { required?: string[] }).required).toBeUndefined();
    const inner = (schema as { properties: { inner: { required?: string[] } } }).properties.inner;
    expect(inner.required).toBeUndefined();
  });
});
