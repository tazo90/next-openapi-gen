import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import tsConfig from "../../../apps/next-app-ts-config/openapi-gen.config.ts";

const workspaceRoot = process.cwd();
const appDir = path.join(workspaceRoot, "apps", "next-app-ts-config");
const wrapperPath = path.join(appDir, "scripts", "generate-typescript-client.mjs");

describe("next-app-ts-config clientSdk golden path", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("wires a thin openapi-generator-cli wrapper behind GENERATE_CLIENT_SDK", () => {
    expect(tsConfig.clientSdk).toEqual([
      {
        name: "typescript-fetch",
        command: "node",
        args: ["./scripts/generate-typescript-client.mjs"],
        outputDir: "./src/generated/api",
        enabled: process.env.GENERATE_CLIENT_SDK === "1",
      },
    ]);
    expect(fs.existsSync(wrapperPath)).toBe(true);
    expect(fs.readFileSync(path.join(appDir, "openapi-gen.config.ts"), "utf8")).toContain(
      'process.env.GENERATE_CLIENT_SDK === "1"',
    );
  });

  it("translates wrapper <spec-path> <output-dir> into openapi-generator-cli flags", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-client-sdk-wrapper-"));
    tempDirs.push(tempDir);

    const specPath = path.join(tempDir, "openapi.json");
    const outputDir = path.join(tempDir, "sdk");
    const argvLog = path.join(tempDir, "pnpm-argv.json");
    const stubBin = path.join(tempDir, "bin");
    fs.mkdirSync(stubBin);
    fs.writeFileSync(specPath, "{}\n");
    fs.writeFileSync(
      path.join(stubBin, "pnpm"),
      `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(process.env.CLIENT_SDK_ARGV_LOG, JSON.stringify(process.argv.slice(2)));
`,
      { mode: 0o755 },
    );

    const result = spawnSync(process.execPath, [wrapperPath, specPath, outputDir], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLIENT_SDK_ARGV_LOG: argvLog,
        PATH: `${stubBin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(argvLog, "utf8"))).toEqual([
      "exec",
      "openapi-generator-cli",
      "generate",
      "-g",
      "typescript-fetch",
      "-i",
      specPath,
      "-o",
      outputDir,
    ]);
  });

  it("exits non-zero when the wrapper contract is missing arguments", () => {
    const result = spawnSync(process.execPath, [wrapperPath], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Usage: generate-typescript-client.mjs <spec-path> <output-dir>",
    );
  });
});
