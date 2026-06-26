import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe.sequential("stable OpenAPI output order", () => {
  it("produces byte-identical JSON across repeated generations of the same fixture", () => {
    const firstRun = generateFixtureSpec({ fixturePath: appRouterCoreFixture });
    const secondRun = generateFixtureSpec({ fixturePath: appRouterCoreFixture });

    try {
      const firstJson = JSON.stringify(firstRun.spec);
      const secondJson = JSON.stringify(secondRun.spec);

      expect(secondJson).toBe(firstJson);
    } finally {
      firstRun.project.cleanup();
      secondRun.project.cleanup();
    }
  });

  it("sorts paths, methods, tags, and component schemas deterministically", () => {
    const { project, spec } = generateFixtureSpec({ fixturePath: appRouterCoreFixture });

    try {
      const pathKeys = Object.keys(spec.paths ?? {});
      expect(pathKeys).toEqual([...pathKeys].toSorted((a, b) => comparePaths(a, b, spec)));

      for (const [, pathDefinition] of Object.entries(spec.paths ?? {})) {
        const methods = Object.keys(pathDefinition ?? {});
        expect(methods).toEqual(methods.slice().toSorted((a, b) => compareMethods(a, b)));
      }

      const tagNames = (spec.tags ?? []).map((tag) => tag.name);
      expect(tagNames).toEqual([...tagNames].toSorted(compareAlpha));

      const schemaNames = Object.keys(spec.components?.schemas ?? {});
      expect(schemaNames).toEqual([...schemaNames].toSorted(compareAlpha));
    } finally {
      project.cleanup();
    }
  });
});

const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

function compareAlpha(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function compareMethods(a: string, b: string): number {
  const aRank = METHOD_ORDER.indexOf(a.toLowerCase());
  const bRank = METHOD_ORDER.indexOf(b.toLowerCase());

  if (aRank !== -1 && bRank !== -1) return aRank - bRank;
  if (aRank !== -1) return -1;
  if (bRank !== -1) return 1;
  return compareAlpha(a, b);
}

function comparePaths(a: string, b: string, spec: { paths?: Record<string, any> }): number {
  const aTags = Object.values(spec.paths?.[a] ?? {}).flatMap(
    (operation: any) => operation?.tags ?? [],
  );
  const bTags = Object.values(spec.paths?.[b] ?? {}).flatMap(
    (operation: any) => operation?.tags ?? [],
  );
  const aPrimaryTag = (aTags[0] as string) || "";
  const bPrimaryTag = (bTags[0] as string) || "";
  const tagComparison = aPrimaryTag.localeCompare(bPrimaryTag);
  if (tagComparison !== 0) return tagComparison;

  const aSegments = a.split("/");
  const bSegments = b.split("/");
  if (aSegments.length !== bSegments.length) return aSegments.length - bSegments.length;

  const sharedSegmentCount = Math.min(aSegments.length, bSegments.length);
  for (let index = 0; index < sharedSegmentCount; index++) {
    const segmentComparison = compareAlpha(aSegments[index], bSegments[index]);
    if (segmentComparison !== 0) return segmentComparison;
  }

  return 0;
}
