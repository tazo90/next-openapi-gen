import fs from "node:fs";
import path from "node:path";

import type { FrameworkSource } from "../frameworks/types.js";
import { IGNORED_SOURCE_DIRECTORIES } from "../shared/ignored-directories.js";

type ScanState = {
  directoryCache: Record<string, string[]>;
  statCache: Record<string, fs.Stats>;
  processFileTracker: Record<string, boolean>;
};

export type CollectedRouteFiles = {
  filePaths: string[];
  scanRouteFilesMs: number;
};

export function collectRouteFiles(
  rootDir: string,
  source: FrameworkSource,
  state: ScanState,
  onIgnoredDirectory?: (directoryPath: string) => void,
): CollectedRouteFiles {
  const filePaths: string[] = [];
  const startedAt = performance.now();
  scanRouteFiles(
    rootDir,
    source,
    state,
    (filePath) => {
      filePaths.push(filePath);
    },
    onIgnoredDirectory,
  );
  return {
    filePaths,
    scanRouteFilesMs: performance.now() - startedAt,
  };
}

export function scanRouteFiles(
  rootDir: string,
  source: FrameworkSource,
  state: ScanState,
  onFile: (filePath: string) => void,
  onIgnoredDirectory?: (directoryPath: string) => void,
): void {
  let files = state.directoryCache[rootDir];
  if (!files) {
    files = fs
      .readdirSync(rootDir)
      .toSorted((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    state.directoryCache[rootDir] = files;
  }

  files.forEach((file) => {
    const filePath = path.join(rootDir, file);
    let stat = state.statCache[filePath];
    if (!stat) {
      stat = fs.statSync(filePath);
      state.statCache[filePath] = stat;
    }

    if (stat.isDirectory()) {
      if (IGNORED_SOURCE_DIRECTORIES.has(file)) {
        onIgnoredDirectory?.(filePath);
        return;
      }
      scanRouteFiles(filePath, source, state, onFile, onIgnoredDirectory);
      return;
    }

    if (source.shouldProcessFile(file) && !state.processFileTracker[filePath]) {
      onFile(filePath);
      state.processFileTracker[filePath] = true;
    }
  });
}
