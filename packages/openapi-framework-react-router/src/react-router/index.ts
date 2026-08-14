import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { generateProject } from "@workspace/openapi-core/core/generate.js";
import { watchProject } from "@workspace/openapi-core/core/watch.js";

import { createReactRouterFrameworkSource } from "../frameworks/react-router/source.js";

export type ReactRouterOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createReactRouterGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createReactRouterFrameworkSource,
  };
}

export function createReactRouterOpenApiPlugin(options: ReactRouterOpenApiPluginOptions = {}): {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
} {
  let stopWatching: (() => void) | undefined;

  return {
    name: "next-openapi-gen",
    async buildStart(): Promise<void> {
      await generateProject({
        adapters: createReactRouterGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    async configureServer(): Promise<void> {
      if (options.watch === false) {
        return;
      }

      stopWatching = await watchProject({
        adapters: createReactRouterGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    closeBundle(): void {
      stopWatching?.();
    },
  };
}
