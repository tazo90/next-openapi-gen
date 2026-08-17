import { afterEach, describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

describe("heap snapshots", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it("records heap around generateFixtureSpec for scale fixtures", () => {
    const rows = [
      ["zod-full-coverage", getProjectFixturePath("next", "app-router", "zod-full-coverage")],
      [
        "ts-full-coverage-at-scale",
        getProjectFixturePath("next", "app-router", "ts-full-coverage-at-scale"),
      ],
    ].map(([name, fixturePath]) => {
      const before = process.memoryUsage();
      const generated = generateFixtureSpec({
        fixturePath,
        openapiVersion: "3.2",
      });
      cleanups.push(() => generated.project.cleanup());
      const after = process.memoryUsage();
      return {
        name,
        heapUsedMb: Number(((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)),
        rssMb: Number((after.rss / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((after.heapTotal / 1024 / 1024).toFixed(2)),
      };
    });

    console.log(JSON.stringify(rows, null, 2));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => Number.isFinite(row.heapUsedMb))).toBe(true);
  });
});
