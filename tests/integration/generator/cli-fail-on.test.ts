import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { copyProjectFixture, getProjectFixturePath } from "../../helpers/test-project.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(repoRoot, "packages", "next-openapi-gen", "bin", "cli.mjs");
const fixturePath = getProjectFixturePath("next", "app-router", "cli-fail-on");

function runCli(projectRoot: string, failOn: "error" | "warning") {
  return spawnSync(
    process.execPath,
    [cliPath, "generate", "--config", "next.openapi.json", "--fail-on", failOn],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAPI_GEN_CACHE: "1",
      },
    },
  );
}

describe("shipped CLI --fail-on integration", () => {
  it("exits successfully at the error threshold and fails at the warning threshold", () => {
    const project = copyProjectFixture(fixturePath);

    try {
      const errorThreshold = runCli(project.root, "error");
      expect(errorThreshold.error).toBeUndefined();
      expect(errorThreshold.status).toBe(0);
      expect(errorThreshold.stderr).toContain("missing-path-params-type");

      const warningThreshold = runCli(project.root, "warning");
      expect(warningThreshold.error).toBeUndefined();
      expect(warningThreshold.status).toBe(1);
      expect(warningThreshold.stderr).toContain(
        "OpenAPI generation failed because diagnostics matched --fail-on warning.",
      );

      const repeatedWarningThreshold = runCli(project.root, "warning");
      expect(repeatedWarningThreshold.status).toBe(1);
      expect(repeatedWarningThreshold.stderr.match(/missing-path-params-type/g)).toHaveLength(1);
    } finally {
      project.cleanup();
    }
  });
});
