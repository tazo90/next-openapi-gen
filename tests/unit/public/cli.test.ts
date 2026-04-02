import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const packageManifestPath = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "packages",
  "next-openapi-gen",
  "package.json",
);

describe("next-openapi-gen cli entrypoint", () => {
  afterEach(() => {
    vi.doUnmock("@workspace/openapi-cli");
    vi.resetModules();
  });

  it("delegates to the shared CLI runtime", async () => {
    const runCli = vi.fn<MockFn>();
    vi.doMock("@workspace/openapi-cli", () => ({
      runCli,
    }));

    await import("../../../packages/next-openapi-gen/src/cli.ts");

    expect(runCli).toHaveBeenCalledWith(process.argv);
  });

  it("publishes both preferred and legacy CLI binaries", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageManifestPath, "utf8")) as {
      bin: Record<string, string>;
    };

    expect(packageJson.bin).toMatchObject({
      "next-openapi-gen": "./dist/cli.js",
      "openapi-gen": "./dist/cli.js",
    });
  });
});
