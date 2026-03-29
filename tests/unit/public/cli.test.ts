import { afterEach, describe, expect, it, vi } from "vitest";

describe("next-openapi-gen cli entrypoint", () => {
  afterEach(() => {
    vi.doUnmock("@workspace/openapi-cli");
    vi.resetModules();
  });

  it("delegates to the shared CLI runtime", async () => {
    const runCli = vi.fn();
    vi.doMock("@workspace/openapi-cli", () => ({
      runCli,
    }));

    await import("../../../packages/next-openapi-gen/src/cli.ts");

    expect(runCli).toHaveBeenCalledWith(process.argv);
  });
});
