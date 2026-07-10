import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { createDocumentFromTemplate } from "@workspace/openapi-core/openapi/document.js";
import { getOpenApiVersionProcessor } from "@workspace/openapi-core/openapi/version-processor.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

function setup(schema: string) {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-union-"));
  fs.writeFileSync(path.join(testDir, "schema.ts"), schema.trim());
  return testDir;
}

describe("Zod undefined union regressions", () => {
  it("z.union([z.string(), z.undefined()]) is optional, not nullable", () => {
    const testDir = setup(`
      import { z } from "zod";

      export const WrapperSchema = z.object({
        label: z.union([z.string(), z.undefined()]),
        id: z.string(),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("WrapperSchema");

      expect(schema?.required).toEqual(["id"]);
      expect(schema?.properties?.label).toEqual({ type: "string" });
      expect(schema?.properties?.label?.nullable).toBeUndefined();
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("z.union([z.string(), z.null(), z.undefined()]) is nullish", () => {
    const testDir = setup(`
      import { z } from "zod";

      export const WrapperSchema = z.object({
        note: z.union([z.string(), z.null(), z.undefined()]),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("WrapperSchema");

      expect(schema?.required ?? []).not.toContain("note");
      expect(schema?.properties?.note).toMatchObject({
        type: "string",
        nullable: true,
      });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});

describe("Nullable representation pipeline", () => {
  it("folds inline anyOf+null to nullable:true after version processing", () => {
    const testDir = setup(`
      import { z } from "zod";

      export const UserSchema = z.object({
        name: z.string().nullable(),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const raw = converter.convertZodSchemaToOpenApi("UserSchema");
      const processed = getOpenApiVersionProcessor("3.1").finalize(
        createDocumentFromTemplate({
          openapi: "3.0.0",
          info: { title: "t", version: "1" },
          paths: {},
          components: { schemas: { UserSchema: raw! } },
        }),
      );

      const nameProp = processed.components?.schemas?.UserSchema?.properties?.name;
      expect(nameProp).toMatchObject({ type: ["string", "null"] });
      expect(nameProp?.anyOf).toBeUndefined();
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
