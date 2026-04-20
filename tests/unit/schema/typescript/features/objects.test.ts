import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › object literals", () => {
  it("simple object literal with required properties", () => {
    const schema = resolve("{ id: string; name: string }");
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: expect.arrayContaining(["id", "name"]),
    });
  });

  it("optional properties are excluded from required", () => {
    const schema = resolve("{ id: string; name?: string }");
    const required = (schema as { required: string[] }).required;
    expect(required).toEqual(["id"]);
    expect((schema as { properties: Record<string, unknown> }).properties.name).toBeDefined();
  });

  it("readonly modifier is accepted", () => {
    const schema = resolve("{ readonly id: string }");
    expect(schema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
  });

  it("nested object literal", () => {
    const schema = resolve("{ user: { id: string } }");
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { id: { type: "string" } },
        },
      },
    });
  });

  it("string index signature emits additionalProperties", () => {
    const schema = resolve("{ [key: string]: number }");
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("property-level @openapi-override merges raw OpenAPI into the schema", () => {
    const schema = resolve(`{
      /**
       * @openapi-override { "format": "email", "maxLength": 320 }
       */
      email: string;
    }`);
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        email: { type: "string", format: "email", maxLength: 320 },
      },
    });
  });

  it("index signature + known properties coexist", () => {
    const schema = resolve("{ id: string; [extra: string]: string }");
    expect(schema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
      additionalProperties: { type: "string" },
    });
  });

  it("Record<string, number> emits additionalProperties", () => {
    const schema = resolve("Record<string, number>");
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });
});
