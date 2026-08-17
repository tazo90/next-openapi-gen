import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

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

    const close = vi.fn<MockFn>();
    const watch = vi.spyOn(fs, "watch").mockImplementation(
      ((_path, _options, _listener) =>
        ({
          close,
        }) as fs.FSWatcher) as typeof fs.watch,
    );

    const loadConfig = vi.fn<MockFn>().mockResolvedValue({
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
    const generateFromLoadedConfig = vi.fn<MockFn>().mockResolvedValue(undefined);

    vi.doMock("@workspace/openapi-core/core/config/load-config.js", () => ({
      loadConfig,
    }));
    vi.doMock("@workspace/openapi-core/core/generate.js", () => ({
      generateFromLoadedConfig,
    }));

    const { watchProject } = await import("@workspace/openapi-core/core/watch.js");

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

  it("collects watch roots from api, schema, schema files, and config path", async () => {
    const { getWatchRoots } = await import("@workspace/openapi-core/core/watch.js");
    const roots = getWatchRoots({
      config: {
        apiDir: "./src/app/api",
        schemaDir: ["./src/schemas", "./src/models"],
        schemaFiles: ["./src/extra.ts"],
      },
      configPath: "/app/openapi-gen.config.ts",
    } as never);

    expect([...roots]).toEqual(
      expect.arrayContaining([
        path.resolve("./src/app/api"),
        path.resolve("./src/schemas"),
        path.resolve("./src/models"),
        path.resolve("./src/extra.ts"),
        path.resolve("/app/openapi-gen.config.ts"),
      ]),
    );

    const fallbackRoots = getWatchRoots({
      config: {
        schemaDir: undefined,
      },
    } as never);
    expect([...fallbackRoots]).toEqual(expect.arrayContaining([path.resolve("./src/app/api")]));
  });

  it("skips missing watch roots when registering watchers", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-missing-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    const missingSchemaDir = path.join(tempDir, "missing-schemas");
    const configPath = path.join(tempDir, "next-openapi.config.ts");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(configPath, "export default {};");

    const watch = vi.spyOn(fs, "watch").mockImplementation(
      ((_path, _options, _listener) =>
        ({
          close: vi.fn<MockFn>(),
        }) as fs.FSWatcher) as typeof fs.watch,
    );

    vi.doMock("@workspace/openapi-core/core/config/load-config.js", () => ({
      loadConfig: vi.fn<MockFn>().mockResolvedValue({
        config: {
          apiDir,
          schemaDir: missingSchemaDir,
          schemaFiles: [],
        },
        configPath,
      }),
    }));
    vi.doMock("@workspace/openapi-core/core/generate.js", () => ({
      generateFromLoadedConfig: vi.fn<MockFn>().mockResolvedValue(undefined),
    }));

    const { watchProject } = await import("@workspace/openapi-core/core/watch.js");
    const stopWatching = await watchProject({ cwd: tempDir, configPath });
    const watchedPaths = watch.mock.calls.map((call) => call[0]);

    expect(watchedPaths).toContain(apiDir);
    expect(watchedPaths).not.toContain(missingSchemaDir);
    stopWatching();
  });

  it("debounces rapid file changes into a single regenerate", async () => {
    vi.useFakeTimers();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-debounce-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    const configPath = path.join(tempDir, "next-openapi.config.ts");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(configPath, "export default {};");

    const listeners: Array<(eventType: string, fileName: string | null) => void> = [];
    vi.spyOn(fs, "watch").mockImplementation(((_path, _options, listener) => {
      if (typeof listener === "function") {
        listeners.push(listener as (eventType: string, fileName: string | null) => void);
      }
      return { close: vi.fn<MockFn>() } as fs.FSWatcher;
    }) as typeof fs.watch);

    const loadConfig = vi.fn<MockFn>().mockResolvedValue({
      config: {
        apiDir,
        schemaDir: path.join(tempDir, "src"),
        schemaFiles: [],
        watch: { debounceMs: 20 },
      },
      configPath,
    });
    const generateFromLoadedConfig = vi.fn<MockFn>().mockResolvedValue(undefined);

    vi.doMock("@workspace/openapi-core/core/config/load-config.js", () => ({
      loadConfig,
    }));
    vi.doMock("@workspace/openapi-core/core/generate.js", () => ({
      generateFromLoadedConfig,
    }));

    const { watchProject } = await import("@workspace/openapi-core/core/watch.js");
    const stopWatching = await watchProject({ cwd: tempDir, configPath });

    expect(generateFromLoadedConfig).toHaveBeenCalledOnce();
    listeners[0]?.("change", "users/route.ts");
    listeners[0]?.("change", "users/route.ts");
    await vi.advanceTimersByTimeAsync(20);

    expect(generateFromLoadedConfig).toHaveBeenCalledTimes(2);
    stopWatching();
  });

  it("replaces watchers when reloaded config drops a root", async () => {
    vi.useFakeTimers();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-replace-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    const extraDir = path.join(tempDir, "extra-schemas");
    const configPath = path.join(tempDir, "next-openapi.config.ts");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(extraDir, { recursive: true });
    fs.writeFileSync(configPath, "export default {};");

    const listeners: Array<(eventType: string, fileName: string | null) => void> = [];
    const extraClose = vi.fn<MockFn>();
    vi.spyOn(fs, "watch").mockImplementation(((watchPath, _options, listener) => {
      if (typeof listener === "function") {
        listeners.push(listener as (eventType: string, fileName: string | null) => void);
      }
      return {
        close: watchPath === extraDir ? extraClose : vi.fn<MockFn>(),
      } as fs.FSWatcher;
    }) as typeof fs.watch);

    const loadConfig = vi
      .fn<MockFn>()
      .mockResolvedValueOnce({
        config: {
          apiDir,
          schemaDir: extraDir,
          schemaFiles: [],
          watch: { debounceMs: 5 },
        },
        configPath,
      })
      .mockResolvedValue({
        config: {
          apiDir,
          schemaDir: path.join(tempDir, "src"),
          schemaFiles: [],
          watch: { debounceMs: 5 },
        },
        configPath,
      });
    const generateFromLoadedConfig = vi.fn<MockFn>().mockResolvedValue(undefined);

    vi.doMock("@workspace/openapi-core/core/config/load-config.js", () => ({
      loadConfig,
    }));
    vi.doMock("@workspace/openapi-core/core/generate.js", () => ({
      generateFromLoadedConfig,
    }));

    const { watchProject } = await import("@workspace/openapi-core/core/watch.js");
    const stopWatching = await watchProject({ cwd: tempDir, configPath });

    listeners[0]?.("change", "route.ts");
    await vi.advanceTimersByTimeAsync(5);

    expect(extraClose).toHaveBeenCalled();
    stopWatching();
  });
});
