import { parentPort } from "node:worker_threads";

import { parse } from "@babel/parser";

/* oxlint-disable unicorn/require-post-message-target-origin -- worker_threads postMessage has no targetOrigin. */

parentPort?.on("message", ({ filePath, source }) => {
  try {
    parse(source, {
      sourceFilename: filePath,
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
    });
    parentPort?.postMessage({ filePath, ok: true });
  } catch (error) {
    parentPort?.postMessage({
      filePath,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
