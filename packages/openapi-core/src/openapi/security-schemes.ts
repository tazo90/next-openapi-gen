import {
  BUILTIN_AUTH_PRESET_KEYWORDS,
  DEFAULT_BUILTIN_SECURITY_SCHEMES,
  type BuiltinAuthPresetKeyword,
} from "../shared/security-requirements.js";
import { DEFAULT_AUTH_PRESET_REPLACEMENTS } from "../shared/spec.js";
import type {
  OpenApiDocument,
  OpenApiPathItem,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
} from "./document-types.js";
import { OPENAPI_HTTP_METHODS } from "./document-types.js";

export function ensureBuiltinSecuritySchemes(
  document: OpenApiDocument,
  authPresets: Record<string, string>,
): void {
  const referencedNames = collectReferencedSchemeNames(document);
  if (referencedNames.size === 0) {
    return;
  }

  const resolvedPresets = { ...DEFAULT_AUTH_PRESET_REPLACEMENTS, ...authPresets };
  const keywordBySchemeName = new Map<string, BuiltinAuthPresetKeyword>();
  for (const keyword of BUILTIN_AUTH_PRESET_KEYWORDS) {
    const schemeName = resolvedPresets[keyword];
    if (!schemeName) {
      continue;
    }
    keywordBySchemeName.set(schemeName, keyword);
  }

  const existing = document.components?.securitySchemes ?? {};
  const additions: Array<[string, OpenApiSecurityScheme]> = [];

  for (const name of referencedNames) {
    if (existing[name] !== undefined) {
      continue;
    }
    const keyword = keywordBySchemeName.get(name);
    if (!keyword) {
      continue;
    }
    additions.push([name, { ...DEFAULT_BUILTIN_SECURITY_SCHEMES[keyword] }]);
  }

  if (additions.length === 0) {
    return;
  }

  additions.sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }));

  if (!document.components) {
    document.components = {};
  }

  document.components.securitySchemes = {
    ...existing,
    ...Object.fromEntries(additions),
  };
}

function collectReferencedSchemeNames(document: OpenApiDocument): Set<string> {
  const names = new Set<string>();
  addRequirementSchemeNames(document.security, names);
  addPathItemSchemeNames(document.paths, names);
  addPathItemSchemeNames(document.webhooks, names);
  return names;
}

function addPathItemSchemeNames(
  items: Record<string, OpenApiPathItem> | undefined,
  names: Set<string>,
): void {
  if (!items) {
    return;
  }

  for (const pathItem of Object.values(items)) {
    if (!pathItem) {
      continue;
    }
    for (const method of OPENAPI_HTTP_METHODS) {
      addRequirementSchemeNames(pathItem[method]?.security, names);
    }
    if (!pathItem.additionalOperations) {
      continue;
    }
    for (const operation of Object.values(pathItem.additionalOperations)) {
      addRequirementSchemeNames(operation.security, names);
    }
  }
}

function addRequirementSchemeNames(
  requirements: OpenApiSecurityRequirement[] | undefined,
  names: Set<string>,
): void {
  if (!requirements) {
    return;
  }
  for (const requirement of requirements) {
    for (const name of Object.keys(requirement)) {
      names.add(name);
    }
  }
}
