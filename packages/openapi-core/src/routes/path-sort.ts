import type { OpenApiPathDefinition } from "../shared/types.js";

export function comparePathDefinitions(
  paths: Record<string, OpenApiPathDefinition>,
  a: string,
  b: string,
): number {
  const aMethods = paths[a] || {};
  const bMethods = paths[b] || {};
  const aTags = Object.values(aMethods).flatMap((method) => method.tags || []);
  const bTags = Object.values(bMethods).flatMap((method) => method.tags || []);
  const aPrimaryTag = aTags[0] || "";
  const bPrimaryTag = bTags[0] || "";
  const tagComparison = aPrimaryTag.localeCompare(bPrimaryTag);

  if (tagComparison !== 0) {
    return tagComparison;
  }

  return a.split("/").length - b.split("/").length;
}

export function sortPathDefinitions(
  paths: Record<string, OpenApiPathDefinition>,
): Record<string, OpenApiPathDefinition> {
  return Object.keys(paths)
    .sort((a, b) => comparePathDefinitions(paths, a, b))
    .reduce<Record<string, OpenApiPathDefinition>>((sorted, key) => {
      const pathDefinition = paths[key];
      if (pathDefinition) {
        sorted[key] = pathDefinition;
      }

      return sorted;
    }, {});
}
