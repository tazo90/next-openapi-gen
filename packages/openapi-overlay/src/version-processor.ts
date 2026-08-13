import type { SpecVersionProcessor } from "@workspace/openapi-core/core/spec-version.js";
import type { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

import type { OverlayObject } from "./types.js";

export type OverlayVersion = "1.0.0" | "1.1.0";

class OverlayVersionProcessor implements SpecVersionProcessor<OverlayObject> {
  constructor(
    public readonly id: OverlayVersion,
    public readonly version: OverlayVersion,
  ) {}

  finalize(document: OverlayObject): OverlayObject {
    const nextDocument = structuredClone(document);
    nextDocument.overlay = this.version;
    if (this.id !== "1.0.0") {
      return nextDocument;
    }

    nextDocument.actions = nextDocument.actions.filter((action) => {
      if (action.copy === undefined) {
        return true;
      }
      delete action.copy;
      return action.update !== undefined || action.remove === true;
    });
    return nextDocument;
  }
}

const PROCESSORS: Record<OverlayVersion, OverlayVersionProcessor> = {
  "1.0.0": new OverlayVersionProcessor("1.0.0", "1.0.0"),
  "1.1.0": new OverlayVersionProcessor("1.1.0", "1.1.0"),
};

export function getOverlayVersionProcessor(version = "1.1.0"): OverlayVersionProcessor {
  if (version.startsWith("1.0")) {
    return PROCESSORS["1.0.0"];
  }
  return PROCESSORS["1.1.0"];
}

export function stripUnsupportedOverlayFields(
  document: OverlayObject,
  version: string,
  diagnostics: DiagnosticsCollector,
  filePath?: string,
): OverlayObject {
  if (!version.startsWith("1.0")) {
    return getOverlayVersionProcessor(version).finalize(document);
  }

  const nextDocument = structuredClone(document);
  nextDocument.overlay = "1.0.0";
  nextDocument.actions = nextDocument.actions.flatMap((action) => {
    if (action.copy === undefined) {
      return [action];
    }
    diagnostics.add({
      code: "OVERLAY_COPY_UNSUPPORTED",
      severity: "warning",
      message: "Overlay 1.0 does not support the copy action; the action was omitted.",
      filePath,
      metadata: { target: action.target },
    });
    if (action.update !== undefined || action.remove === true) {
      const { copy: _copy, ...rest } = action;
      return [rest];
    }
    return [];
  });
  return nextDocument;
}
