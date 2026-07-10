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
          { type: "string", format: "cuid2" },
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
});
