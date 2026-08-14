import type { OpenApiVersion } from "../../shared/types.js";
import extensionRegistry from "./extension.json" with { type: "json" };
import formatRegistry from "./format.json" with { type: "json" };
import mediaTypeRegistry from "./media-type.json" with { type: "json" };
import namespaceRegistry from "./namespace.json" with { type: "json" };
import tagKindRegistry from "./tag-kind.json" with { type: "json" };

export const OAI_REGISTRY_SNAPSHOT_DATE: string = formatRegistry.snapshotDate;

export type MediaTypeGroup =
  | "json"
  | "binary"
  | "forms"
  | "linksets"
  | "sequential-json"
  | "sequential-multipart"
  | "sse"
  | "text"
  | "toon"
  | "xml"
  | "unknown";

const VERSION_RANK: Record<OpenApiVersion, number> = {
  "3.0": 0,
  "3.1": 1,
  "3.2": 2,
  "3.3-preview": 3,
};

const FORMAT_BY_VALUE = new Map(
  formatRegistry.formats.map((entry) => [entry.value, entry] as const),
);
const TAG_KINDS = new Set(tagKindRegistry.kinds);
const EXTENSION_BY_FIELD = new Map(
  extensionRegistry.extensions.map((entry) => [entry.field, entry] as const),
);
const EXTENSION_BY_NAME = new Map(
  extensionRegistry.extensions.map((entry) => [entry.name, entry] as const),
);
const RESERVED_NAMESPACE_PREFIXES = namespaceRegistry.namespaces.map((entry) => entry.prefix);

function matchesMediaType(candidate: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    return candidate.startsWith(pattern.slice(0, -1));
  }
  return candidate === pattern;
}

export function isRegisteredFormat(value: string): boolean {
  return FORMAT_BY_VALUE.has(value);
}

export function isDeprecatedFormat(value: string): boolean {
  return FORMAT_BY_VALUE.get(value)?.deprecated === true;
}

export function isRegisteredTagKind(value: string): boolean {
  return TAG_KINDS.has(value);
}

export function mediaTypeGroup(mediaType: string): MediaTypeGroup {
  const normalized = mediaType.toLowerCase();
  if (normalized === "application/json" || normalized.endsWith("+json")) {
    return "json";
  }

  for (const group of mediaTypeRegistry.groups) {
    if (group.mediaTypes.some((pattern) => matchesMediaType(normalized, pattern))) {
      return group.id as MediaTypeGroup;
    }
  }

  if (normalized.startsWith("text/")) {
    return "text";
  }

  return "unknown";
}

export function isSequentialMediaType(mediaType: string): boolean {
  const group = mediaTypeGroup(mediaType);
  return group === "sequential-json" || group === "sequential-multipart" || group === "sse";
}

export function backportExtension(field: string, targetVersion: OpenApiVersion): string | null {
  const entry = EXTENSION_BY_FIELD.get(field);
  if (!entry) {
    return null;
  }

  const sinceRank = VERSION_RANK[entry.since as OpenApiVersion] ?? VERSION_RANK["3.2"];
  if (VERSION_RANK[targetVersion] >= sinceRank) {
    return null;
  }

  return entry.name;
}

export function nativeFieldForExtension(extension: string): string | null {
  return EXTENSION_BY_NAME.get(extension)?.field ?? null;
}

export function isReservedOaiNamespace(extensionName: string): boolean {
  return RESERVED_NAMESPACE_PREFIXES.some((prefix) => extensionName.startsWith(prefix));
}

export function moveFieldToExtension(
  target: Record<string, unknown>,
  field: string,
  targetVersion: OpenApiVersion,
): void {
  if (!(field in target)) {
    return;
  }

  const extension = backportExtension(field, targetVersion);
  if (extension) {
    target[extension] = target[field];
    delete target[field];
  }
}

export function promoteExtensionField(
  target: Record<string, unknown>,
  field: string,
  targetVersion: OpenApiVersion,
): void {
  const extension = backportExtension(field, "3.0");
  if (!extension || !(extension in target)) {
    return;
  }

  if (backportExtension(field, targetVersion) === null && !(field in target)) {
    target[field] = target[extension];
    delete target[extension];
  }
}
