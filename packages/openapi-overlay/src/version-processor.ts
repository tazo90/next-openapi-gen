import type { SpecVersionProcessor } from "@workspace/openapi-core/core/spec-version.js";
import type { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

import { isReusableActionReference, resolveOverlayActions } from "./resolve.js";
import type { OverlayObject } from "./types.js";

export type OverlayVersion = "1.0.0" | "1.1.0" | "1.2.0";

class OverlayVersionProcessor implements SpecVersionProcessor<OverlayObject> {
  constructor(
    public readonly id: OverlayVersion,
    public readonly version: OverlayVersion,
  ) {}

  finalize(document: OverlayObject): OverlayObject {
    const nextDocument = structuredClone(document);
    nextDocument.overlay = this.version;
    if (this.id === "1.2.0") {
      return nextDocument;
    }

    const downgraded = downgradeOverlay12(nextDocument);
    if (this.id !== "1.0.0") {
      return downgraded;
    }

    downgraded.actions = downgraded.actions.filter((action) => {
      if (action.copy === undefined) {
        return true;
      }
      delete action.copy;
      return action.update !== undefined || action.remove === true;
    });
    return downgraded;
  }
}

const PROCESSORS: Record<OverlayVersion, OverlayVersionProcessor> = {
  "1.0.0": new OverlayVersionProcessor("1.0.0", "1.0.0"),
  "1.1.0": new OverlayVersionProcessor("1.1.0", "1.1.0"),
  "1.2.0": new OverlayVersionProcessor("1.2.0", "1.2.0"),
};

export function getOverlayVersionProcessor(version = "1.1.0"): OverlayVersionProcessor {
  if (version.startsWith("1.2")) {
    return PROCESSORS["1.2.0"];
  }
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
  if (version.startsWith("1.2")) {
    return getOverlayVersionProcessor(version).finalize(document);
  }

  addOverlay12Diagnostics(document, diagnostics, filePath);
  const nextDocument = getOverlayVersionProcessor(version).finalize(document);
  if (!version.startsWith("1.0")) {
    return nextDocument;
  }

  for (const action of resolveOverlayActions(document).actions) {
    if (action.copy === undefined) {
      continue;
    }
    diagnostics.add({
      code: "OVERLAY_COPY_UNSUPPORTED",
      severity: "warning",
      message: "Overlay 1.0 does not support the copy action; the action was omitted.",
      filePath,
      metadata: { target: action.target },
    });
  }

  return nextDocument;
}

function downgradeOverlay12(document: OverlayObject): OverlayObject {
  const resolved = resolveOverlayActions(document);
  delete resolved.$self;
  delete resolved.targetFormat;
  delete resolved.components;
  return resolved;
}

function addOverlay12Diagnostics(
  document: OverlayObject,
  diagnostics: DiagnosticsCollector,
  filePath?: string,
): void {
  if (document.$self) {
    diagnostics.add({
      code: "OVERLAY_SELF_UNSUPPORTED",
      severity: "warning",
      message: "Overlay 1.0 and 1.1 do not support $self; the field was omitted.",
      filePath,
    });
  }

  if (document.targetFormat) {
    diagnostics.add({
      code: "OVERLAY_TARGET_FORMAT_UNSUPPORTED",
      severity: "warning",
      message: "Overlay 1.0 and 1.1 do not support targetFormat; the field was omitted.",
      filePath,
    });
  }

  if (hasReusableActions(document)) {
    diagnostics.add({
      code: "OVERLAY_REUSABLE_ACTION_INLINED",
      severity: "warning",
      message:
        "Overlay 1.0 and 1.1 do not support reusable actions; $ref actions were inlined and components were omitted.",
      filePath,
    });
  }
}

function hasReusableActions(document: OverlayObject): boolean {
  return Boolean(document.components?.actions) || document.actions.some(isReusableActionReference);
}
