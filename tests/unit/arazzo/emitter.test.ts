import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createArazzoEmitter } from "@workspace/openapi-arazzo";
import { buildGenerationIR } from "@workspace/openapi-core/core/generation-ir.js";
import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

function createEmitterContext(root: string, arazzo?: Record<string, unknown>) {
  const outputDir = path.join(root, "public");
  fs.mkdirSync(outputDir, { recursive: true });
  const document = {
    openapi: "3.2.0",
    info: { title: "API", version: "1.0.0" },
    paths: {},
  };

  return {
    config: { arazzo },
    ir: buildGenerationIR(document),
    openapiDocument: document,
    diagnostics: new DiagnosticsCollector(),
    outputFile: path.join(outputDir, "openapi.json"),
    outputDir,
    cwd: root,
  };
}

describe("Arazzo emitter", () => {
  it("skips emission when no workflow files are configured", async () => {
    const emitter = createArazzoEmitter();

    expect(await emitter.emit(createEmitterContext(os.tmpdir()) as never)).toEqual([]);
    expect(await emitter.emit(createEmitterContext(os.tmpdir(), { files: [] }) as never)).toEqual(
      [],
    );
  });

  it("synthesizes an OpenAPI source and merges components from workflow files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-arazzo-emit-"));
    try {
      fs.mkdirSync(path.join(root, "arazzo"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "arazzo", "purchase.yaml"),
        `arazzo: 1.1.0
info:
  title: Purchase
  version: 1.0.0
workflows:
  - workflowId: purchaseOrder
    steps:
      - stepId: list
        operationId: getOrdersList
components:
  inputs:
    filter: string
`,
      );
      fs.writeFileSync(
        path.join(root, "arazzo", "events.yaml"),
        `arazzo: 1.1.0
info:
  title: Events
  version: 1.0.0
sourceDescriptions:
  - name: spec
  - name: events
    type: asyncapi
    url: ./asyncapi.yaml
workflows: []
`,
      );

      const artifacts = await createArazzoEmitter().emit(
        createEmitterContext(root, {
          files: ["./arazzo/**/*.yaml"],
        }) as never,
      );
      const output = fs.readFileSync(path.join(root, "public", "arazzo.yaml"), "utf8");

      expect(artifacts).toEqual([
        { kind: "arazzo", path: path.join(root, "public", "arazzo.yaml") },
      ]);
      expect(output).toContain("name: spec");
      expect(output).toContain("type: openapi");
      expect(output).toContain("type: asyncapi");
      expect(output).toContain("url: ./asyncapi.yaml");
      expect(output).toContain("filter: string");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes an empty Arazzo 1.0 document when globs match nothing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-arazzo-empty-"));
    try {
      await createArazzoEmitter().emit(
        createEmitterContext(root, {
          version: "1.0.0",
          files: ["./arazzo/**/*.yaml"],
        }) as never,
      );
      const output = fs.readFileSync(path.join(root, "public", "arazzo.yaml"), "utf8");

      expect(output).toContain("arazzo: 1.0.0");
      expect(output).toContain("title: Generated workflows");
      expect(output).not.toContain("$self:");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects files that are not Arazzo documents", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-arazzo-invalid-"));
    try {
      fs.mkdirSync(path.join(root, "arazzo"), { recursive: true });
      fs.writeFileSync(path.join(root, "arazzo", "bad.yaml"), "info:\n  title: Not a workflow\n");

      await expect(
        createArazzoEmitter().emit(
          createEmitterContext(root, {
            files: ["./arazzo/bad.yaml"],
          }) as never,
        ),
      ).rejects.toThrow(/Invalid Arazzo document/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
