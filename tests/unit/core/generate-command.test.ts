import { describe, expect, it } from "vitest";

import { runExternalCommand } from "@workspace/openapi-core/core/generate.js";

describe("runExternalCommand", () => {
  it("preserves shell metacharacters as literal arguments", async () => {
    const argument = "value; still-an-argument";
    await expect(
      runExternalCommand(process.execPath, [
        "-e",
        "process.exit(process.argv[1] === 'value; still-an-argument' ? 0 : 1)",
        argument,
      ]),
    ).resolves.toBeUndefined();
  });

  it.runIf(process.platform === "win32")("runs Windows package-manager command shims", async () => {
    await expect(runExternalCommand("pnpm.cmd", ["--version"])).resolves.toBeUndefined();
  });
});
