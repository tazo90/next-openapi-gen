import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { processCustomSchemaFiles } from "@workspace/openapi-core/schema/core/custom-schema-file-processor.js";

describe("processCustomSchemaFiles", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("loads schemas from json, yaml, and plain schema objects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-custom-schema-files-"));
    roots.push(root);

    const jsonPath = path.join(root, "schemas.json");
    const yamlPath = path.join(root, "schemas.yaml");
    const plainJsonPath = path.join(root, "plain.json");

    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        components: {
          schemas: {
            User: { type: "object" },
          },
        },
      }),
    );
    fs.writeFileSync(yamlPath, ["schemas:", "  Audit:", "    type: object"].join("\n"));
    fs.writeFileSync(
      plainJsonPath,
      JSON.stringify({
        ErrorResponse: { type: "object" },
      }),
    );

    expect(processCustomSchemaFiles([jsonPath, yamlPath, plainJsonPath])).toEqual({
      User: { type: "object" },
      Audit: { type: "object" },
      ErrorResponse: { type: "object" },
    });
  });

  it("skips missing and unsupported files without throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-custom-schema-warnings-"));
    roots.push(root);

    const txtPath = path.join(root, "schemas.txt");
    fs.writeFileSync(txtPath, "unsupported");

    expect(() =>
      processCustomSchemaFiles([path.join(root, "missing.json"), txtPath]),
    ).not.toThrow();
    expect(processCustomSchemaFiles([path.join(root, "missing.json"), txtPath])).toEqual({});
  });

  it("returns empty results for invalid and malformed schema payloads", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-custom-schema-invalid-"));
    roots.push(root);

    const invalidJsonPath = path.join(root, "invalid.json");
    const scalarJsonPath = path.join(root, "scalar.json");
    fs.writeFileSync(invalidJsonPath, "{");
    fs.writeFileSync(scalarJsonPath, JSON.stringify("nope"));

    expect(processCustomSchemaFiles([invalidJsonPath, scalarJsonPath])).toEqual({});
  });
});
