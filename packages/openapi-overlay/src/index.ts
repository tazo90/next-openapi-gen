export { applyOverlay } from "./apply.js";
export { applyOpenApiOverlay, createOverlayEmitter } from "./emitter.js";
export { isReusableActionReference, resolveOverlayActions } from "./resolve.js";
export { detectDocumentFormat, overlayTargetFormatMatches } from "./target-format.js";
export type { OverlayTargetFormatMatch } from "./target-format.js";
export type {
  ActionObject,
  OverlayAction,
  OverlayComponents,
  OverlayDocumentFormat,
  OverlayInfo,
  OverlayObject,
  OverlayTargetFormat,
  ReusableActionObject,
  ReusableActionReferenceObject,
} from "./types.js";
export { getOverlayVersionProcessor, stripUnsupportedOverlayFields } from "./version-processor.js";
export type { OverlayVersion } from "./version-processor.js";
