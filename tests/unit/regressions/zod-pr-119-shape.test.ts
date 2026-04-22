import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert, convertFromFile } from "../schema/zod/features/_helpers.js";

/**
 * Regressions for the shape mismatches reported in tazo90/next-openapi-gen#119
 * and adjacent fixes landed in this workspace. Each test pins down a concrete
 * edge case so it doesn't quietly regress again.
 */
describe("Regressions › PR #119-style Zod edge cases", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  it("z.object() keeps the exact required set (no spurious requireds)", () => {
    const schema = convert(
      `z.object({
        id: z.string(),
        name: z.string().optional(),
        age: z.number().nullable(),
      })`,
      roots,
    );
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        age: { type: "number", nullable: true },
      },
    });
    const required = (schema as { required: string[] }).required.slice().sort();
    expect(required).toEqual(["age", "id"]);
  });

  it("spread expressions inside z.object() keep sibling fields", () => {
    const schema = convertFromFile(
      {
        "schemas.ts": `
          import { z } from "zod";

          export const Base = z.object({
            id: z.string(),
            slug: z.string(),
          });

          export const Extended = z.object({
            ...Base.shape,
            title: z.string(),
          });
        `,
      },
      { file: "schemas.ts", exportName: "Extended" },
      roots,
    );

    expect(schema).toBeDefined();
    if (!schema) return;
    expect(schema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        title: { type: "string" },
      }),
    });
  });

  it("identifier members of z.union resolve against sibling exports", () => {
    const schema = convertFromFile(
      {
        "schemas.ts": `
          import { z } from "zod";

          export const Cat = z.object({ kind: z.literal("cat"), meow: z.boolean() });
          export const Dog = z.object({ kind: z.literal("dog"), bark: z.boolean() });
          export const Pet = z.union([Cat, Dog]);
        `,
      },
      { file: "schemas.ts", exportName: "Pet" },
      roots,
    );
    expect(schema).toBeDefined();
    if (!schema) return;
    expect(schema).toMatchObject({ oneOf: expect.any(Array) });
    expect((schema as { oneOf: unknown[] }).oneOf.length).toBe(2);
  });

  it("export * re-exports still resolve through the barrel", () => {
    const schema = convertFromFile(
      {
        "schemas/user.ts": `
          import { z } from "zod";
          export const User = z.object({ id: z.string().uuid() });
        `,
        "schemas/index.ts": `
          export * from "./user";
        `,
        "entry.ts": `
          import { z } from "zod";
          import { User } from "./schemas";
          export const Envelope = z.object({ user: User });
        `,
      },
      { file: "entry.ts", exportName: "Envelope" },
      roots,
    );
    expect(schema).toBeDefined();
    if (!schema) return;
    expect(schema).toMatchObject({
      type: "object",
      properties: { user: expect.any(Object) },
    });
  });

  it("aliased zod imports (import { z as zod }) still resolve primitives", () => {
    const schema = convertFromFile(
      {
        "schemas.ts": `
          import { z as zod } from "zod";

          export const User = zod.object({
            id: zod.string().uuid(),
            name: zod.string(),
          });
        `,
      },
      { file: "schemas.ts", exportName: "User" },
      roots,
    );
    expect(schema).toBeDefined();
    if (!schema) return;
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
      },
    });
  });
});
