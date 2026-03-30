import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { generateProject } from "@workspace/openapi-core/core/generate.js";
import { watchProject } from "@workspace/openapi-core/core/watch.js";

import { createTanStackFrameworkSource } from "../frameworks/tanstack/source.js";

export type ViteOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createTanStackGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createTanStackFrameworkSource,
  };
}

export function createViteOpenApiPlugin(options: ViteOpenApiPluginOptions = {}) {
  let stopWatching: (() => void) | undefined;

  return {
    name: "next-openapi-gen",
    async buildStart() {
      await generateProject({
        adapters: createTanStackGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    async configureServer() {
      if (options.watch === false) {
        return;
      }

      stopWatching = await watchProject({
        adapters: createTanStackGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    closeBundle() {
      stopWatching?.();
    },
  };
}
