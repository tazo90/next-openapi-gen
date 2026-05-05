import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

/**
 * Regression test for tazo90/next-openapi-gen#141
 *
 * When `z.discriminatedUnion()` members use `...baseShape` spread syntax,
 * the spread properties must be preserved in the generated component schemas.
 *
 * Root cause: `processFileForZodSchema` stored schemas via `storeResolvedSchema`
 * (bypassing `applyMetaIdOverride`) when processing a schema that was pulled in
 * as a discriminatedUnion member dependency. This left the renamed component
 * (e.g. `Dog` from `.meta({ id: 'Dog' })`) unregistered, so the component only
 * contained the discriminator field from a later, incomplete processing pass.
 */
describe("Regressions › issue #141 — discriminatedUnion member spread properties", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-issue-141-"));
    roots.push(dir);
    return dir;
  }

  it("member schemas defined after the union retain spread base-shape properties", () => {
    // Reproduces the exact ordering from the bug report: animalSchema is declared
    // before dogSchema/catSchema, so the converter encounters the union first.
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, "schemas.ts"),
      `
import { z } from "zod";

const baseShape = {
  id: z.number().int().describe('Item ID'),
  name: z.string().describe('Item name'),
};

export const animalSchema = z
  .discriminatedUnion('type', [dogSchema, catSchema])
  .meta({ id: 'Animal' });

export const dogSchema = z
  .object({ ...baseShape, type: z.literal('dog') })
  .meta({ id: 'Dog' });

export const catSchema = z
  .object({ ...baseShape, type: z.literal('cat') })
  .meta({ id: 'Cat' });
`,
    );

    const converter = new ZodSchemaConverter(dir);
    converter.convertZodSchemaToOpenApi("animalSchema");

    const dog = converter.zodSchemas["Dog"];
    expect(dog, "Dog component must be registered").toBeDefined();
    expect(dog?.properties, "Dog must have properties").toBeDefined();
    expect(dog?.properties).toHaveProperty("id");
    expect(dog?.properties).toHaveProperty("name");
    expect(dog?.properties).toHaveProperty("type");
    expect(dog?.required?.sort()).toEqual(["id", "name", "type"].sort());

    const cat = converter.zodSchemas["Cat"];
    expect(cat, "Cat component must be registered").toBeDefined();
    expect(cat?.properties).toHaveProperty("id");
    expect(cat?.properties).toHaveProperty("name");
    expect(cat?.properties).toHaveProperty("type");
  });

  it("member schemas defined before the union also retain spread base-shape properties", () => {
    // Baseline: members defined before the union — the original (working) order.
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, "schemas.ts"),
      `
import { z } from "zod";

const baseShape = {
  id: z.number().int().describe('Item ID'),
  name: z.string().describe('Item name'),
};

export const dogSchema = z
  .object({ ...baseShape, type: z.literal('dog') })
  .meta({ id: 'Dog' });

export const catSchema = z
  .object({ ...baseShape, type: z.literal('cat') })
  .meta({ id: 'Cat' });

export const animalSchema = z
  .discriminatedUnion('type', [dogSchema, catSchema])
  .meta({ id: 'Animal' });
`,
    );

    const converter = new ZodSchemaConverter(dir);
    converter.convertZodSchemaToOpenApi("animalSchema");

    const dog = converter.zodSchemas["Dog"];
    expect(dog, "Dog component must be registered").toBeDefined();
    expect(dog?.properties).toHaveProperty("id");
    expect(dog?.properties).toHaveProperty("name");
    expect(dog?.properties).toHaveProperty("type");

    const cat = converter.zodSchemas["Cat"];
    expect(cat, "Cat component must be registered").toBeDefined();
    expect(cat?.properties).toHaveProperty("id");
    expect(cat?.properties).toHaveProperty("name");
    expect(cat?.properties).toHaveProperty("type");

    const animal = converter.zodSchemas["Animal"];
    expect(animal, "Animal component must be registered").toBeDefined();
    expect((animal as { oneOf?: unknown[] })?.oneOf).toHaveLength(2);
  });
});
