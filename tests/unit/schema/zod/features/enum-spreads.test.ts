import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe("Zod features › enums built from spreads", () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
  );

  it("follows spreads of const arrays and refuses a partial list", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-enum-spreads-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "values.ts"), `export const BASE = ["a", "b"] as const;\n`);
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        "import { z } from 'zod';",
        "import { BASE } from './values';",
        "const ALL = [...BASE, 'z'] as const;",
        "export const Schema = z.object({",
        "  inline: z.enum([...BASE, 'z']),",
        "  named: z.enum(ALL),",
        "  partial: z.enum([...compute(), 'z']),",
        "});",
        "",
      ].join("\n"),
    );

    const diagnostics = new DiagnosticsCollector();
    const converter = new ZodSchemaConverter(root, undefined, undefined, diagnostics);
    converter.processAllSchemasInFile(schemaFile);

    expect(converter.zodSchemas.Schema).toMatchObject({
      properties: {
        inline: { type: "string", enum: ["a", "b", "z"] },
        named: { type: "string", enum: ["a", "b", "z"] },
        partial: { type: "string" },
      },
    });
    expect(converter.zodSchemas.Schema).not.toMatchObject({
      properties: { partial: { enum: expect.anything() } },
    });
    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({ code: "unresolved-zod-enum" }),
    ]);
  });
});
