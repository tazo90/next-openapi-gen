import type { OpenApiParameter, OpenApiReference } from "./document-types.js";

const REFERENCE_KEYS = new Set(["$ref", "summary", "description"]);

export function isOpenApiReference(value: unknown): value is OpenApiReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.$ref !== "string") {
    return false;
  }

  return Object.keys(record).every((key) => REFERENCE_KEYS.has(key));
}

export function isOpenApiParameter(
  value: OpenApiParameter | OpenApiReference,
): value is OpenApiParameter {
  return !isOpenApiReference(value) && "in" in value && "name" in value;
}
