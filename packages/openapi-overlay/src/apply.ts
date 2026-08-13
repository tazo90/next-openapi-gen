import { queryJsonPath, type JsonPathMatch } from "@workspace/openapi-core/shared/jsonpath.js";

import type { ActionObject, OverlayObject } from "./types.js";

export function applyOverlay<T>(document: T, overlay: OverlayObject): T {
  const nextDocument = structuredClone(document);
  for (const action of overlay.actions) {
    applyAction(nextDocument, action);
  }
  return nextDocument;
}

function applyAction(document: unknown, action: ActionObject): void {
  const matches = queryJsonPath(document, action.target);
  if (action.remove === true) {
    for (const match of matches) {
      removeMatch(match);
    }
    return;
  }

  if (typeof action.copy === "string") {
    const sources = queryJsonPath(document, action.copy);
    const source = sources[0]?.value;
    for (const match of matches) {
      replaceMatch(match, structuredClone(source));
    }
  }

  if (action.update !== undefined) {
    for (const match of matches) {
      replaceMatch(match, mergeValue(match.value, action.update));
    }
  }
}

function removeMatch(match: JsonPathMatch): void {
  if (match.parent === null || match.key === null) {
    return;
  }
  if (Array.isArray(match.parent) && typeof match.key === "number") {
    match.parent.splice(match.key, 1);
    return;
  }
  if (isRecord(match.parent) && typeof match.key === "string") {
    delete match.parent[match.key];
  }
}

function replaceMatch(match: JsonPathMatch, nextValue: unknown): void {
  if (match.parent === null) {
    if (isRecord(match.value) && isRecord(nextValue)) {
      for (const key of Object.keys(match.value)) {
        delete match.value[key];
      }
      Object.assign(match.value, nextValue);
    }
    return;
  }

  if (Array.isArray(match.parent) && typeof match.key === "number") {
    match.parent[match.key] = nextValue;
    return;
  }
  if (isRecord(match.parent) && typeof match.key === "string") {
    match.parent[match.key] = nextValue;
  }
}

function mergeValue(current: unknown, update: unknown): unknown {
  if (isRecord(current) && isRecord(update)) {
    return jsonMergePatch(current, update);
  }
  return structuredClone(update);
}

function jsonMergePatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const nextTarget = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete nextTarget[key];
      continue;
    }
    const existing = nextTarget[key];
    nextTarget[key] =
      isRecord(existing) && isRecord(value)
        ? jsonMergePatch(existing, value)
        : structuredClone(value);
  }
  return nextTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
