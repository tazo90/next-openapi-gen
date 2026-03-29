import fs from "node:fs";
import path from "node:path";

import type { FrameworkSource } from "../frameworks/types.js";

type ScanState = {
  directoryCache: Record<string, string[]>;
  statCache: Record<string, fs.Stats>;
  processFileTracker: Record<string, boolean>;
};

export function scanRouteFiles(
  rootDir: string,
  source: FrameworkSource,
  state: ScanState,
  onFile: (filePath: string) => void,
): void {
  let files = state.directoryCache[rootDir];
  if (!files) {
    files = fs.readdirSync(rootDir);
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
      scanRouteFiles(filePath, source, state, onFile);
      return;
    }

    if (source.shouldProcessFile(file) && !state.processFileTracker[filePath]) {
      onFile(filePath);
      state.processFileTracker[filePath] = true;
    }
  });
}
