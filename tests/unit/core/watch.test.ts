import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("watchProject", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useRealTimers();
  });

  it("loads config, generates once, and tears down watchers", async () => {
    vi.useFakeTimers();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    const schemaDir = path.join(tempDir, "src");
    const configPath = path.join(tempDir, "next-openapi.config.ts");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(configPath, "export default {};");

    const close = vi.fn();
    const watch = vi.spyOn(fs, "watch").mockImplementation(
      ((_path, _options, _listener) =>
        ({
          close,
        }) as fs.FSWatcher) as typeof fs.watch,
    );

    const loadConfig = vi.fn().mockResolvedValue({
      config: {
        apiDir,
        schemaDir,
        schemaFiles: [],
        watch: {
          debounceMs: 5,
        },
      },
      configPath,
    });
    const generateFromLoadedConfig = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@next-openapi-gen/core/config/load-config.js", () => ({
      loadConfig,
    }));
    vi.doMock("@next-openapi-gen/core/generate.js", () => ({
      generateFromLoadedConfig,
    }));

    const { watchProject } = await import("@next-openapi-gen/core/watch.js");

    const stopWatching = await watchProject({
      cwd: tempDir,
      configPath,
    });

    expect(loadConfig).toHaveBeenCalledOnce();
    expect(generateFromLoadedConfig).toHaveBeenCalledOnce();
    expect(watch).toHaveBeenCalled();

    stopWatching();

    expect(close).toHaveBeenCalled();
  });
});
