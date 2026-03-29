import fs from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const { buildProgram, parse } = vi.hoisted(() => {
  const parse = vi.fn();
  return {
    buildProgram: vi.fn(() => ({ parse })),
    parse,
  };
});

vi.mock("@workspace/openapi-cli/cli/program.js", () => ({
  buildProgram,
}));

import {
  CLI_NAME,
  LEGACY_CLI_NAME,
  getCliVersion,
  resolveCliName,
  runCli,
} from "@workspace/openapi-cli/index.js";

describe("openapi-cli root entrypoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    buildProgram.mockClear();
    parse.mockClear();
  });

  it("resolves the preferred and legacy CLI command names", () => {
    expect(resolveCliName(["node", "/usr/local/bin/openapi-gen"])).toBe(CLI_NAME);
    expect(resolveCliName(["node", "/usr/local/bin/next-openapi-gen"])).toBe(LEGACY_CLI_NAME);
    expect(resolveCliName([])).toBe(CLI_NAME);
  });

  it("falls back to 0.0.0 when package metadata is unavailable", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(getCliVersion()).toBe("0.0.0");
  });

  it("delegates runCli through the built program", () => {
    const argv = ["node", "openapi-gen", "generate"];

    runCli(argv);

    expect(buildProgram).toHaveBeenCalledWith({ argv });
    expect(parse).toHaveBeenCalledWith(argv);
  });

  it("executes the CLI entrypoint via runCli", async () => {
    vi.resetModules();
    const runCli = vi.fn();
    vi.doMock("@workspace/openapi-cli/index.js", () => ({
      runCli,
    }));

    await import("@workspace/openapi-cli/cli.ts");

    expect(runCli).toHaveBeenCalledWith(process.argv);
  });
});
