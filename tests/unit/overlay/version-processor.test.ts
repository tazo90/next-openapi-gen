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

  it("keeps reusable actions, $self, and targetFormat for Overlay 1.2", () => {
    const finalized = getOverlayVersionProcessor("1.2.0").finalize({
      overlay: "1.2.0",
      $self: "https://example.com/overlays/public.overlay.yaml",
      targetFormat: "openapi",
      info: { title: "Overlay", version: "1.0.0" },
      components: {
        actions: {
          updateTitle: { fields: { update: { title: "Public" } } },
        },
      },
      actions: [{ $ref: "#/components/actions/updateTitle", target: "$.info" }],
    });

    expect(finalized.overlay).toBe("1.2.0");
    expect(finalized.$self).toBe("https://example.com/overlays/public.overlay.yaml");
    expect(finalized.targetFormat).toBe("openapi");
    expect(finalized.components?.actions?.updateTitle).toEqual({
      fields: { update: { title: "Public" } },
    });
    expect(finalized.actions[0]).toMatchObject({ $ref: "#/components/actions/updateTitle" });
  });

  it("inlines reusable actions and drops 1.2 fields for Overlay 1.1", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = stripUnsupportedOverlayFields(
      {
        overlay: "1.2.0",
        $self: "https://example.com/overlays/public.overlay.yaml",
        targetFormat: "openapi",
        info: { title: "Overlay", version: "1.0.0" },
        components: {
          actions: {
            updateTitle: { fields: { update: { title: "Public" } } },
          },
        },
        actions: [{ $ref: "#/components/actions/updateTitle", target: "$.info" }],
      },
      "1.1.0",
      diagnostics,
      "overlays/public.overlay.yaml",
    );

    expect(finalized.overlay).toBe("1.1.0");
    expect(finalized.$self).toBeUndefined();
    expect(finalized.targetFormat).toBeUndefined();
    expect(finalized.components).toBeUndefined();
    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
    expect(diagnostics.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OVERLAY_SELF_UNSUPPORTED", severity: "warning" }),
        expect.objectContaining({
          code: "OVERLAY_TARGET_FORMAT_UNSUPPORTED",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "OVERLAY_REUSABLE_ACTION_INLINED",
          severity: "warning",
        }),
      ]),
    );
  });

  it("inlines reusable copy actions then strips copy for Overlay 1.0", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = stripUnsupportedOverlayFields(
      {
        overlay: "1.2.0",
        info: { title: "Overlay", version: "1.0.0" },
        components: {
          actions: {
            copyTitle: { fields: { copy: "$.info.version" } },
          },
        },
        actions: [{ $ref: "#/components/actions/copyTitle", target: "$.info.title" }],
      },
      "1.0.0",
      diagnostics,
    );

    expect(finalized.overlay).toBe("1.0.0");
    expect(finalized.actions).toEqual([]);
    expect(diagnostics.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OVERLAY_REUSABLE_ACTION_INLINED" }),
        expect.objectContaining({ code: "OVERLAY_COPY_UNSUPPORTED" }),
      ]),
    );
  });

  it("selects the 1.2 processor for 1.2 versions", () => {
    expect(getOverlayVersionProcessor("1.2").version).toBe("1.2.0");
    expect(getOverlayVersionProcessor("1.2.1").version).toBe("1.2.0");
  });

  it("keeps Overlay 1.2 documents when stripping against version 1.2", () => {
    const diagnostics = new DiagnosticsCollector();
    const source = {
      overlay: "1.2.0",
      $self: "https://example.com/overlays/public.overlay.yaml",
      targetFormat: "openapi" as const,
      info: { title: "Overlay", version: "1.0.0" },
      components: {
        actions: {
          updateTitle: { fields: { update: { title: "Public" } } },
        },
      },
      actions: [{ $ref: "#/components/actions/updateTitle", target: "$.info" }],
    };
    const finalized = stripUnsupportedOverlayFields(source, "1.2.0", diagnostics);

    expect(finalized).toMatchObject({
      overlay: "1.2.0",
      $self: source.$self,
      targetFormat: "openapi",
    });
    expect(diagnostics.getAll()).toEqual([]);
  });

  it("drops unused components.actions when finalizing Overlay 1.1", () => {
    const finalized = getOverlayVersionProcessor("1.1.0").finalize({
      overlay: "1.2.0",
      info: { title: "Overlay", version: "1.0.0" },
      components: {
        actions: {
          unused: { fields: { update: { title: "Unused" } } },
        },
      },
      actions: [{ target: "$.info", update: { title: "Public" } }],
    });

    expect(finalized.components).toBeUndefined();
    expect(finalized.actions).toEqual([{ target: "$.info", update: { title: "Public" } }]);
  });
});
