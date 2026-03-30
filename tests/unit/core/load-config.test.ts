import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CONFIG_FILENAMES,
  loadConfig,
} from "@workspace/openapi-core/core/config/load-config.js";
import { defineConfig } from "@workspace/openapi-core/core/config/define-config.js";

describe("loadConfig", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
    vi.restoreAllMocks();
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

  it("discovers the modern config aliases during the deprecation window", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-config-modern-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, "openapi-gen.config.json"),
      JSON.stringify({
        openapi: "3.1.0",
        info: {
          title: "Modern",
          version: "1.0.0",
        },
      }),
    );

    const loadedConfig = await loadConfig({ cwd: tempDir });

    expect(loadedConfig.configPath).toBe(path.join(tempDir, "openapi-gen.config.json"));
    expect(loadedConfig.config.info.title).toBe("Modern");
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

  it("keeps legacy config names first in discovery while both names are supported", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-config-legacy-first-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, "next-openapi.config.js"),
      `export default ${JSON.stringify(
        defineConfig({
          openapi: "3.0.0",
          info: {
            title: "Legacy First",
            version: "1.0.0",
          },
        }),
      )};`,
    );
    fs.writeFileSync(
      path.join(tempDir, "openapi-gen.config.js"),
      `export default ${JSON.stringify(
        defineConfig({
          openapi: "3.1.0",
          info: {
            title: "Modern Second",
            version: "1.0.0",
          },
        }),
      )};`,
    );

    const loadedConfig = await loadConfig({ cwd: tempDir });

    expect(path.basename(loadedConfig.configPath ?? "")).toBe("next-openapi.config.js");
    expect(loadedConfig.config.info.title).toBe("Legacy First");
  });

  it("warns when a legacy config filename is loaded", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-config-warning-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(
      path.join(tempDir, "next.openapi.json"),
      JSON.stringify({
        openapi: "3.0.0",
        info: {
          title: "Legacy Warning",
          version: "1.0.0",
        },
      }),
    );
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);

    await loadConfig({ cwd: tempDir });

    expect(emitWarning).toHaveBeenCalledWith(
      expect.stringContaining('The config filename "next.openapi.json" is deprecated'),
      expect.objectContaining({
        type: "DeprecationWarning",
      }),
    );
  });

  it("exposes the supported config discovery names", () => {
    expect(DEFAULT_CONFIG_FILENAMES).toContain("next-openapi.config.ts");
    expect(DEFAULT_CONFIG_FILENAMES).toContain("next.openapi.json");
    expect(DEFAULT_CONFIG_FILENAMES).toContain("openapi-gen.config.ts");
    expect(DEFAULT_CONFIG_FILENAMES).toContain("openapi-gen.config.json");
  });
});
