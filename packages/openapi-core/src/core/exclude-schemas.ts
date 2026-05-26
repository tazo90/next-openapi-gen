import { logger } from "../shared/logger.js";
import type { OpenApiDocument, OpenApiSchema } from "../shared/types.js";

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

export function matchExcludePatterns(names: string[], patterns: string[]): string[] {
  if (patterns.length === 0) return [];
  const regexes = patterns.map(patternToRegExp);
  return names.filter((name) => regexes.some((re) => re.test(name)));
}

export function applyExcludeSchemas(
  document: OpenApiDocument,
  mergedSchemas: Record<string, unknown>,
  excludedSchemas: Record<string, OpenApiSchema>,
): void {
  const excludedNames = new Set(Object.keys(excludedSchemas));
  if (excludedNames.size === 0) return;

  walkAndInline(document, excludedSchemas, excludedNames, new Set());
  walkAndInline(mergedSchemas, excludedSchemas, excludedNames, new Set());

  for (const name of excludedNames) {
    delete mergedSchemas[name];
  }
}

function walkAndInline(
  obj: unknown,
  excluded: Record<string, OpenApiSchema>,
  excludedNames: Set<string>,
  visiting: Set<string>,
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkAndInline(item, excluded, excludedNames, visiting);
    }
    return;
  }

  const rec = obj as Record<string, unknown>;
  const ref = rec["$ref"];

  if (typeof ref === "string") {
    const match = ref.match(/^#\/components\/schemas\/(.+)$/);
    const name = match?.[1];
    if (name && excludedNames.has(name)) {
      if (visiting.has(name)) {
        logger.warn(`Circular reference to internal schema "${name}", keeping $ref`);
        return;
      }
      const schemaDef = excluded[name];
      if (schemaDef) {
        const cloned = JSON.parse(JSON.stringify(schemaDef)) as Record<string, unknown>;
        delete rec["$ref"];
        Object.assign(rec, cloned);
        const newVisiting = new Set(visiting);
        newVisiting.add(name);
        for (const key of Object.keys(rec)) {
          walkAndInline(rec[key], excluded, excludedNames, newVisiting);
        }
        return;
      }
    }
  }

  for (const key of Object.keys(rec)) {
    walkAndInline(rec[key], excluded, excludedNames, visiting);
  }
}
