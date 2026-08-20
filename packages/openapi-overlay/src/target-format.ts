import type { OverlayDocumentFormat, OverlayObject } from "./types.js";

const RESERVED_TARGET_FORMATS = new Set<OverlayDocumentFormat>(["openapi", "asyncapi", "arazzo"]);

export type OverlayTargetFormatMatch =
  | { ok: true }
  | { ok: false; expected: string; actual: OverlayDocumentFormat | undefined };

export function detectDocumentFormat(document: unknown): OverlayDocumentFormat | undefined {
  if (!isRecord(document)) {
    return undefined;
  }

  if (typeof document.openapi === "string") {
    return "openapi";
  }
  if (typeof document.asyncapi === "string") {
    return "asyncapi";
  }
  if (typeof document.arazzo === "string") {
    return "arazzo";
  }

  return undefined;
}

export function overlayTargetFormatMatches(
  document: unknown,
  overlay: OverlayObject,
): OverlayTargetFormatMatch {
  const expected = overlay.targetFormat;
  if (expected === undefined || !isReservedTargetFormat(expected)) {
    return { ok: true };
  }

  const actual = detectDocumentFormat(document);
  if (actual === undefined || actual === expected) {
    return { ok: true };
  }

  return { ok: false, expected, actual };
}

function isReservedTargetFormat(value: string): value is OverlayDocumentFormat {
  return RESERVED_TARGET_FORMATS.has(value as OverlayDocumentFormat);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
