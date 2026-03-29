import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAMES, loadConfig } from "@next-openapi-gen/core/config/load-config.js";
import { defineConfig } from "@next-openapi-gen/core/config/define-config.js";

describe("loadConfig", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("discovers the default json config file", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-config-json-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, "next.openapi.json"),
      JSON.stringify({
        openapi: "3.0.0",
        info: {
          title: "Fixture",
          version: "1.0.0",
        },
      }),
    );

    const loadedConfig = await loadConfig({ cwd: tempDir });

    expect(loadedConfig.configPath).toBe(path.join(tempDir, "next.openapi.json"));
    expect(loadedConfig.config.info.title).toBe("Fixture");
  });

  it("prefers typed config files over the legacy json config", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-config-ts-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, "next-openapi.config.js"),
      `export default ${JSON.stringify(
        defineConfig({
          openapi: "3.1.0",
          info: {
            title: "Typed",
            version: "1.0.0",
          },
          generatedDir: ".openapi-cache",
        }),
      )};`,
    );
    fs.writeFileSync(
      path.join(tempDir, "next.openapi.json"),
      JSON.stringify({
        openapi: "3.0.0",
        info: {
          title: "Legacy",
          version: "1.0.0",
        },
      }),
    );

    const loadedConfig = await loadConfig({ cwd: tempDir });

    expect(path.basename(loadedConfig.configPath ?? "")).toBe("next-openapi.config.js");
    expect(loadedConfig.config.info.title).toBe("Typed");
    expect(loadedConfig.config.generatedDir).toBe(".openapi-cache");
  });

  it("exposes the supported config discovery names", () => {
    expect(DEFAULT_CONFIG_FILENAMES).toContain("next-openapi.config.ts");
    expect(DEFAULT_CONFIG_FILENAMES).toContain("next.openapi.json");
  });
});
