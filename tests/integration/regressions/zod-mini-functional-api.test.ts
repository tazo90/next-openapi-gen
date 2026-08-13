import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

function setup(schema: string) {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-mini-"));
  fs.writeFileSync(path.join(testDir, "schema.ts"), schema.trim());
  return testDir;
}

describe("Zod Mini functional API regressions (issue #167)", () => {
  it("handles functional optional/nullable wrappers and overlapping unions", () => {
    const testDir = setup(`
      import { z } from "zod/mini";

      export const exampleSchema = z.object({
        id: z.union([z.cuid2(), z.uuid()]),
        name: z.optional(z.string()),
        deletedAt: z.nullable(z.iso.datetime()),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("exampleSchema");

      expect(schema?.required).toEqual(["id", "deletedAt"]);
      expect(schema?.properties?.id).toEqual({
        anyOf: [
          { type: "string", pattern: "^[0-9a-z]+$" },
          { type: "string", format: "uuid" },
        ],
      });
      expect(schema?.properties?.name).toEqual({ type: "string" });
      expect(schema?.properties?.deletedAt).toEqual({
        type: "string",
        format: "date-time",
        nullable: true,
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles functional z.extend(base, shape)", () => {
    const testDir = setup(`
      import { z } from "zod/mini";

      const Base = z.object({ name: z.string() });
      export const Extended = z.extend(Base, { age: z.number() });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("Extended");

      expect(schema).toMatchObject({
        type: "object",
        required: ["name", "age"],
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles .check() with functional refinements", () => {
    const testDir = setup(`
      import { z } from "zod/mini";

      export const PasswordSchema = z.string().check(z.minLength(10), z.maxLength(100));
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("PasswordSchema");

      expect(schema).toMatchObject({
        type: "string",
        minLength: 10,
        maxLength: 100,
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles functional readonly/default/describe wrappers", () => {
    const testDir = setup(`
      import { z } from "zod/mini";

      export const ItemSchema = z.object({
        id: z.readonly(z.string()),
        status: z.default(z.string(), "draft"),
        note: z.describe(z.string(), "Optional note"),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("ItemSchema");

      expect(schema?.properties?.id).toMatchObject({ type: "string", readOnly: true });
      expect(schema?.properties?.status).toMatchObject({
        type: "string",
        default: "draft",
      });
      expect(schema?.properties?.note).toMatchObject({
        type: "string",
        description: "Optional note",
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("supports namespace import alias for zod/mini", () => {
    const testDir = setup(`
      import * as z from "zod/mini";

      export const AliasSchema = z.extend(z.object({ id: z.string() }), { active: z.boolean() });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("AliasSchema");

      expect(schema).toMatchObject({
        type: "object",
        required: ["id", "active"],
        properties: {
          id: { type: "string" },
          active: { type: "boolean" },
        },
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("supports import { z as zod } from zod/v4/mini", () => {
    const testDir = setup(`
      import { z as zod } from "zod/v4/mini";

      export const MiniSchema = zod.object({
        label: zod.optional(zod.string()),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("MiniSchema");

      expect(schema?.required ?? []).not.toContain("label");
      expect(schema?.properties?.label).toEqual({ type: "string" });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
