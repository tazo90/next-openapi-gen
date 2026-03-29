import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "./config/load-config.js";
import { DEFAULT_WATCH_DEBOUNCE_MS } from "./defaults.js";
import { generateFromLoadedConfig } from "./generate.js";
import {
  createSharedGenerationRuntime,
  invalidateRuntimeDirectory,
  invalidateRuntimeFile,
} from "./runtime.js";

export type WatchProjectOptions = {
  cwd?: string | undefined;
  configPath?: string | undefined;
};

export async function watchProject(options: WatchProjectOptions = {}): Promise<() => void> {
  let loadedConfig = await loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
  });
  const runtime = createSharedGenerationRuntime();
  const watchers = new Map<string, fs.FSWatcher>();
  const debounceMs = loadedConfig.config.watch?.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;

  await generateFromLoadedConfig(loadedConfig, runtime);
  registerWatchers(loadedConfig);

  let timeout: NodeJS.Timeout | undefined;

  function schedule(filePath?: string) {
    if (filePath) {
      invalidateRuntimeFile(runtime, filePath);
      invalidateRuntimeDirectory(runtime, path.dirname(filePath));
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(async () => {
      loadedConfig = await loadConfig({
        cwd: options.cwd,
        configPath: options.configPath,
      });
      registerWatchers(loadedConfig);
      await generateFromLoadedConfig(loadedConfig, runtime);
    }, debounceMs);
  }

  function registerWatchers(configFile: typeof loadedConfig) {
    const nextRoots = getWatchRoots(configFile);
    for (const existingPath of watchers.keys()) {
      if (!nextRoots.has(existingPath)) {
        watchers.get(existingPath)?.close();
        watchers.delete(existingPath);
      }
    }

    for (const watchPath of nextRoots) {
      if (watchers.has(watchPath) || !fs.existsSync(watchPath)) {
        continue;
      }

      const recursive = fs.statSync(watchPath).isDirectory();
      watchers.set(
        watchPath,
        fs.watch(watchPath, { recursive }, (_eventType, fileName) => {
          const changedPath =
            recursive && fileName ? path.join(watchPath, fileName.toString()) : watchPath;
          schedule(changedPath);
        }),
      );
    }
  }

  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
  };
}

function getWatchRoots(loadedConfig: Awaited<ReturnType<typeof loadConfig>>): Set<string> {
  const roots = new Set<string>();
  roots.add(path.resolve(loadedConfig.config.apiDir ?? "./src/app/api"));

  const schemaDir = loadedConfig.config.schemaDir;
  const schemaDirs = Array.isArray(schemaDir) ? schemaDir : [schemaDir];
  for (const dir of schemaDirs.filter((candidate): candidate is string => Boolean(candidate))) {
    roots.add(path.resolve(dir));
  }

  for (const schemaFile of loadedConfig.config.schemaFiles ?? []) {
    roots.add(path.resolve(schemaFile));
  }

  if (loadedConfig.configPath) {
    roots.add(path.resolve(loadedConfig.configPath));
  }

  return roots;
}
