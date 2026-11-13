import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe(".default() with an object or array", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function convert(source: string[]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-default-values-"));
    roots.push(root);
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      ['import { z } from "zod";', ...source].join("\n"),
    );
    const converter = new ZodSchemaConverter(root);
    converter.processAllSchemasInFile(path.join(root, "schemas.ts"));
    return converter.zodSchemas;
  }

  it("keeps nested objects and arrays in the default", () => {
    const schemas = convert([
      "export const settingsSchema = z.object({",
      "  sync: z",
      '    .object({ run: z.enum(["auto", "manual"]), tags: z.array(z.string()), limits: z.record(z.string(), z.number()) })',
      '    .default({ run: "auto", tags: ["a"], limits: {} }),',
      '  channels: z.array(z.string()).default(["email"]),',
      "});",
    ]);

    expect(schemas.settingsSchema?.properties?.sync?.default).toEqual({
      run: "auto",
      tags: ["a"],
      limits: {},
    });
    expect(schemas.settingsSchema?.properties?.channels?.default).toEqual(["email"]);
  });

  it("leaves the default out rather than emit part of it", () => {
    const schemas = convert([
      "const DEFAULTS = { run: 'auto' };",
      "export const settingsSchema = z.object({",
      '  sync: z.object({ run: z.enum(["auto", "manual"]) }).default({ ...DEFAULTS }),',
      "});",
    ]);

    expect(schemas.settingsSchema?.properties?.sync).not.toHaveProperty("default");
  });
});
