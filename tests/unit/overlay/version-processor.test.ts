import { describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import {
  getOverlayVersionProcessor,
  stripUnsupportedOverlayFields,
} from "@workspace/openapi-overlay";

describe("overlay version processor", () => {
  it("keeps copy actions for Overlay 1.1", () => {
    const finalized = getOverlayVersionProcessor("1.1.0").finalize({
      overlay: "1.1.0",
      info: { title: "Overlay", version: "1.0.0" },
      actions: [{ target: "$.info.title", copy: "$.info.version" }],
    });

    expect(finalized.actions[0]).toMatchObject({ copy: "$.info.version" });
  });

  it("omits copy-only actions for Overlay 1.0 with a diagnostic", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = stripUnsupportedOverlayFields(
      {
        overlay: "1.1.0",
        info: { title: "Overlay", version: "1.0.0" },
        actions: [
          { target: "$.info.title", copy: "$.info.version" },
          { target: "$.info", update: { title: "Public" }, copy: "$.unused" },
        ],
      },
      "1.0.0",
      diagnostics,
      "overlays/public.overlay.yaml",
    );

    expect(finalized.overlay).toBe("1.0.0");
    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
    expect(diagnostics.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OVERLAY_COPY_UNSUPPORTED",
          severity: "warning",
        }),
      ]),
    );
  });

  it("keeps Overlay 1.0 actions that do not use copy", () => {
    const finalized = getOverlayVersionProcessor("1.0.0").finalize({
      overlay: "1.1.0",
      info: { title: "Overlay", version: "1.0.0" },
      actions: [{ target: "$.info", update: { title: "Public" } }],
    });

    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
  });

  it("keeps non-copy actions when stripping Overlay 1.0 fields", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = stripUnsupportedOverlayFields(
      {
        overlay: "1.1.0",
        info: { title: "Overlay", version: "1.0.0" },
        actions: [{ target: "$.info", update: { title: "Public" } }],
      },
      "1.0.0",
      diagnostics,
    );

    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
    expect(diagnostics.getAll()).toEqual([]);
  });

  it("drops copy-only actions when finalizing Overlay 1.0", () => {
    const finalized = getOverlayVersionProcessor("1.0.0").finalize({
      overlay: "1.1.0",
      info: { title: "Overlay", version: "1.0.0" },
      actions: [
        { target: "$.info.title", copy: "$.info.version" },
        { target: "$.info", update: { title: "Public" }, copy: "$.unused" },
      ],
    });

    expect(finalized.overlay).toBe("1.0.0");
    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
  });
});
