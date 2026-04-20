import type { OpenApiPathDefinition } from "../shared/types.js";

const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const;

const METHOD_RANK: Record<string, number> = METHOD_ORDER.reduce<Record<string, number>>(
  (accumulator, method, index) => {
    accumulator[method] = index;
    return accumulator;
  },
  {},
);

const LOCALE_COMPARE_OPTIONS: Intl.CollatorOptions = { sensitivity: "base" };

function compareStringsStable(a: string, b: string): number {
  return a.localeCompare(b, "en", LOCALE_COMPARE_OPTIONS);
}

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

  const aSegments = a.split("/");
  const bSegments = b.split("/");
  const depthComparison = aSegments.length - bSegments.length;

  if (depthComparison !== 0) {
    return depthComparison;
  }

  const sharedSegmentCount = Math.min(aSegments.length, bSegments.length);
  for (let index = 0; index < sharedSegmentCount; index++) {
    const segmentComparison = compareStringsStable(aSegments[index]!, bSegments[index]!);
    if (segmentComparison !== 0) {
      return segmentComparison;
    }
  }

  return 0;
}

function compareMethods(a: string, b: string): number {
  const aRank = METHOD_RANK[a.toLowerCase()];
  const bRank = METHOD_RANK[b.toLowerCase()];

  if (aRank !== undefined && bRank !== undefined) {
    return aRank - bRank;
  }

  if (aRank !== undefined) {
    return -1;
  }

  if (bRank !== undefined) {
    return 1;
  }

  return compareStringsStable(a, b);
}

function sortPathMethods(pathDefinition: OpenApiPathDefinition): OpenApiPathDefinition {
  const sortedMethodEntries = Object.entries(pathDefinition).sort(([a], [b]) =>
    compareMethods(a, b),
  );
  return sortedMethodEntries.reduce<OpenApiPathDefinition>((sorted, [method, operation]) => {
    sorted[method as keyof OpenApiPathDefinition] = operation;
    return sorted;
  }, {});
}

export function sortPathDefinitions(
  paths: Record<string, OpenApiPathDefinition>,
): Record<string, OpenApiPathDefinition> {
  return Object.keys(paths)
    .sort((a, b) => comparePathDefinitions(paths, a, b))
    .reduce<Record<string, OpenApiPathDefinition>>((sorted, key) => {
      const pathDefinition = paths[key];
      if (pathDefinition) {
        sorted[key] = sortPathMethods(pathDefinition);
      }

      return sorted;
    }, {});
}
