import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import { applyOpenApiOverlay, createOverlayEmitter } from "@workspace/openapi-overlay";

function createEmitterContext(root: string, overlay?: Record<string, unknown>) {
  const outputDir = path.join(root, "public");
  fs.mkdirSync(outputDir, { recursive: true });
  const document = {
    openapi: "3.2.0",
    info: { title: "Internal API", version: "1.0.0" },
    paths: {
      "/orders": { get: { operationId: "getOrdersList" } },
    },
  };

  return {
    config: { overlay },
    ir: { operations: [], operationsById: new Map() },
    openapiDocument: document,
    diagnostics: new DiagnosticsCollector(),
    outputFile: path.join(outputDir, "openapi.json"),
    outputDir,
    cwd: root,
  };
}

describe("overlay emitter", () => {
  it("skips emission when overlay config is absent", async () => {
    expect(await createOverlayEmitter().emit(createEmitterContext(os.tmpdir()) as never)).toEqual(
      [],
    );
  });

  it("applies overlays, emits a generated overlay, and re-exports applyOpenApiOverlay", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-overlay-emit-"));
    try {
      fs.mkdirSync(path.join(root, "overlays"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "overlays", "apply.yaml"),
        `overlay: 1.1.0
info:
  title: Public
  version: 1.0.0
actions:
  - target: "$.info"
    update:
      title: Public API
`,
      );
      fs.writeFileSync(
        path.join(root, "overlays", "generate.yaml"),
        `overlay: 1.1.0
info:
  title: Generated
  version: 1.0.0
actions:
  - target: "$.info.description"
    update: Partner
`,
      );

      const context = createEmitterContext(root, {
        apply: ["./overlays/apply.yaml"],
        generate: {
          files: ["./overlays/generate.yaml"],
        },
      });
      const artifacts = await createOverlayEmitter().emit(context);

      expect(context.openapiDocument.info.title).toBe("Public API");
      expect(artifacts).toEqual([
        { kind: "overlay", path: path.join(root, "public", "overlay.yaml") },
      ]);
      expect(fs.readFileSync(path.join(root, "public", "overlay.yaml"), "utf8")).toContain(
        "extends:",
      );
      expect(
        applyOpenApiOverlay(context.openapiDocument, {
          overlay: "1.1.0",
          info: { title: "Direct", version: "1.0.0" },
          actions: [{ target: "$.info", update: { title: "Direct API" } }],
        }).info.title,
      ).toBe("Direct API");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a default overlay when generate globs match nothing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-overlay-empty-"));
    try {
      await createOverlayEmitter().emit(
        createEmitterContext(root, {
          generate: { files: ["./overlays/**/*.yaml"] },
        }),
      );

      expect(fs.readFileSync(path.join(root, "public", "overlay.yaml"), "utf8")).toContain(
        "title: Generated Overlay",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects files that are not Overlay documents", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-overlay-invalid-"));
    try {
      fs.mkdirSync(path.join(root, "overlays"), { recursive: true });
      fs.writeFileSync(path.join(root, "overlays", "bad.yaml"), "info:\n  title: Not an overlay\n");

      await expect(
        createOverlayEmitter().emit(
          createEmitterContext(root, {
            apply: ["./overlays/bad.yaml"],
          }) as never,
        ),
      ).rejects.toThrow(/Invalid Overlay document/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
