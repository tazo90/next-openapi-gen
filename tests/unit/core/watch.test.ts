import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getWatchRoots, watchProject } from "@workspace/openapi-core/core/watch.js";

type MockFn = (...args: unknown[]) => unknown;

const watchMocks = vi.hoisted(() => ({
  invalidateRuntimePaths: vi.fn<MockFn>(),
  generateFromLoadedConfig: vi.fn<MockFn>(),
  loadConfig: vi.fn<MockFn>(),
  runtime: {},
}));

vi.mock("@workspace/openapi-core/core/config/load-config.js", () => ({
  loadConfig: watchMocks.loadConfig,
}));
vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateFromLoadedConfig: watchMocks.generateFromLoadedConfig,
}));
vi.mock("@workspace/openapi-core/core/runtime.js", () => ({
  createSharedGenerationRuntime: () => watchMocks.runtime,
  invalidateRuntimePaths: watchMocks.invalidateRuntimePaths,
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("watchProject", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
    vi.restoreAllMocks();
    watchMocks.invalidateRuntimePaths.mockReset();
    watchMocks.generateFromLoadedConfig.mockReset();
    watchMocks.loadConfig.mockReset();
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

    watchMocks.loadConfig.mockResolvedValue({
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
    const generateFromLoadedConfig =
      watchMocks.generateFromLoadedConfig.mockResolvedValue(undefined);

    const stopWatching = await watchProject({
      cwd: tempDir,
      configPath,
    });

    expect(watchMocks.loadConfig).toHaveBeenCalledOnce();
    expect(generateFromLoadedConfig).toHaveBeenCalledOnce();
    expect(watch).toHaveBeenCalled();

    stopWatching();

    expect(close).toHaveBeenCalled();
  });

  it("collects watch roots from api, schema, schema files, and config path", () => {
    const roots = getWatchRoots({
      config: {
        apiDir: "./src/app/api",
        schemaDir: ["./src/schemas", "./src/models"],
        schemaFiles: ["./src/extra.ts"],
      },
      configPath: "/app/openapi-gen.config.ts",
    });

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
    });
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

    watchMocks.loadConfig.mockResolvedValue({
      config: {
        apiDir,
        schemaDir: missingSchemaDir,
        schemaFiles: [],
      },
      configPath,
    });
    watchMocks.generateFromLoadedConfig.mockResolvedValue(undefined);
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

    watchMocks.loadConfig.mockResolvedValue({
      config: {
        apiDir,
        schemaDir: path.join(tempDir, "src"),
        schemaFiles: [],
        watch: { debounceMs: 20 },
      },
      configPath,
    });
    const generateFromLoadedConfig =
      watchMocks.generateFromLoadedConfig.mockResolvedValue(undefined);
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

    watchMocks.loadConfig
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
    watchMocks.generateFromLoadedConfig.mockResolvedValue(undefined);
    const stopWatching = await watchProject({ cwd: tempDir, configPath });

    listeners[0]?.("change", "route.ts");
    await vi.advanceTimersByTimeAsync(5);

    expect(extraClose).toHaveBeenCalled();
    stopWatching();
  });

  it("rejects an initial generation failure and closes registered watchers", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-initial-failure-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    fs.mkdirSync(apiDir, { recursive: true });
    const close = vi.fn<MockFn>();
    vi.spyOn(fs, "watch").mockReturnValue({ close } as fs.FSWatcher);
    watchMocks.loadConfig.mockResolvedValue({
      config: { apiDir },
      configPath: undefined,
    });
    watchMocks.generateFromLoadedConfig.mockRejectedValue(new Error("initial generation failed"));

    await expect(watchProject({ cwd: tempDir })).rejects.toThrow("initial generation failed");

    expect(close).toHaveBeenCalledOnce();
  });

  it("recovers from a failed regeneration and keeps watching", async () => {
    vi.useFakeTimers();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-recovery-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    fs.mkdirSync(apiDir, { recursive: true });

    const listeners: Array<(eventType: string, fileName: string | null) => void> = [];
    vi.spyOn(fs, "watch").mockImplementation(((_path, _options, listener) => {
      if (typeof listener === "function") {
        listeners.push(listener as (eventType: string, fileName: string | null) => void);
      }
      return { close: vi.fn<MockFn>() } as fs.FSWatcher;
    }) as typeof fs.watch);

    watchMocks.loadConfig.mockResolvedValue({
      config: { apiDir, watch: { debounceMs: 5 } },
      configPath: undefined,
    });
    const generateFromLoadedConfig = watchMocks.generateFromLoadedConfig
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("broken route"))
      .mockResolvedValue(undefined);

    const stopWatching = await watchProject({ cwd: tempDir });

    listeners[0]?.("change", "route.ts");
    await vi.advanceTimersByTimeAsync(5);
    listeners[0]?.("change", "route.ts");
    await vi.advanceTimersByTimeAsync(5);

    expect(generateFromLoadedConfig).toHaveBeenCalledTimes(3);
    stopWatching();
  });

  it("serializes overlapping regenerations and coalesces queued work", async () => {
    vi.useFakeTimers();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-watch-overlap-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src", "app", "api");
    fs.mkdirSync(apiDir, { recursive: true });

    const listeners: Array<(eventType: string, fileName: string | null) => void> = [];
    vi.spyOn(fs, "watch").mockImplementation(((_path, _options, listener) => {
      if (typeof listener === "function") {
        listeners.push(listener as (eventType: string, fileName: string | null) => void);
      }
      return { close: vi.fn<MockFn>() } as fs.FSWatcher;
    }) as typeof fs.watch);

    watchMocks.loadConfig.mockResolvedValue({
      config: { apiDir, watch: { debounceMs: 5 } },
      configPath: undefined,
    });
    const inFlight = createDeferred();
    let active = 0;
    let maxActive = 0;
    let invalidatedWhileActive = false;
    watchMocks.invalidateRuntimePaths.mockImplementation(() => {
      invalidatedWhileActive ||= active > 0;
    });
    const generateFromLoadedConfig = watchMocks.generateFromLoadedConfig.mockImplementation(
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (generateFromLoadedConfig.mock.calls.length === 2) {
          await inFlight.promise;
        }
        active -= 1;
      },
    );
    const stopWatching = await watchProject({ cwd: tempDir });

    listeners[0]?.("change", "first.ts");
    await vi.advanceTimersByTimeAsync(5);
    expect(generateFromLoadedConfig).toHaveBeenCalledTimes(2);

    listeners[0]?.("change", "second.ts");
    listeners[0]?.("change", "third.ts");
    await vi.advanceTimersByTimeAsync(5);
    expect(generateFromLoadedConfig).toHaveBeenCalledTimes(2);

    inFlight.resolve();
    await vi.waitFor(() => {
      expect(generateFromLoadedConfig).toHaveBeenCalledTimes(3);
    });
    expect(maxActive).toBe(1);
    expect(invalidatedWhileActive).toBe(false);
    expect(watchMocks.invalidateRuntimePaths).toHaveBeenLastCalledWith(
      watchMocks.runtime,
      expect.objectContaining({
        files: [path.join(apiDir, "second.ts"), path.join(apiDir, "third.ts")],
      }),
    );
    stopWatching();
  });
});
