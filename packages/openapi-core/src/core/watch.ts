import fs from "node:fs";
import path from "node:path";

import { logger } from "../shared/logger.js";
import type { GenerationAdapters } from "./adapters.js";
import { loadConfig } from "./config/load-config.js";
import { DEFAULT_WATCH_DEBOUNCE_MS } from "./defaults.js";
import { generateFromLoadedConfig } from "./generate.js";
import { createSharedGenerationRuntime, invalidateRuntimePaths } from "./runtime.js";

export type WatchProjectOptions = {
  adapters?: GenerationAdapters | undefined;
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
  let timeout: NodeJS.Timeout | undefined;
  let regenerationRunning = false;
  let regenerationQueued = false;
  let stopped = false;
  const pendingChangedFiles = new Set<string>();

  registerWatchers(loadedConfig);
  try {
    await regenerate({ catchErrors: false, reloadConfig: false });
  } catch (error) {
    stopWatching();
    throw error;
  }

  function schedule(filePath?: string) {
    if (stopped) {
      return;
    }

    if (filePath) {
      pendingChangedFiles.add(filePath);
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = undefined;
      void regenerate({ catchErrors: true, reloadConfig: true });
    }, debounceMs);
  }

  async function regenerate(regenerationOptions: {
    catchErrors: boolean;
    reloadConfig: boolean;
  }): Promise<void> {
    if (regenerationRunning) {
      regenerationQueued = true;
      return;
    }

    regenerationRunning = true;
    let shouldReloadConfig = regenerationOptions.reloadConfig;
    try {
      do {
        regenerationQueued = false;
        const changedFiles = [...pendingChangedFiles];
        pendingChangedFiles.clear();
        const catchErrors = regenerationOptions.catchErrors || shouldReloadConfig;
        let invalidationsApplied = false;
        try {
          if (shouldReloadConfig) {
            const nextConfig = await loadConfig({
              cwd: options.cwd,
              configPath: options.configPath,
            });
            if (stopped) {
              return;
            }
            loadedConfig = nextConfig;
            registerWatchers(loadedConfig);
          }
          if (changedFiles.length > 0) {
            invalidateRuntimePaths(runtime, {
              files: changedFiles,
              directories: changedFiles.map((changedFile) => path.dirname(changedFile)),
            });
          }
          invalidationsApplied = true;
          await generateFromLoadedConfig(loadedConfig, runtime, options.adapters);
        } catch (error) {
          if (!invalidationsApplied) {
            changedFiles.forEach((filePath) => pendingChangedFiles.add(filePath));
          }
          if (!catchErrors) {
            throw error;
          }
          logger.error(
            `OpenAPI regeneration failed; continuing to watch: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        shouldReloadConfig = true;
      } while (regenerationQueued);
    } finally {
      regenerationRunning = false;
    }
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
          const changedPath = recursive && fileName ? path.join(watchPath, fileName) : watchPath;
          schedule(changedPath);
        }),
      );
    }
  }

  function stopWatching(): void {
    stopped = true;
    regenerationQueued = false;
    pendingChangedFiles.clear();
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
  }

  return stopWatching;
}

export function getWatchRoots(loadedConfig: Awaited<ReturnType<typeof loadConfig>>): Set<string> {
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
