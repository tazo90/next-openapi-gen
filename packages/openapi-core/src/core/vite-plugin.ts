import type { GenerationAdapters } from "./adapters.js";
import { generateProject } from "./generate.js";
import { watchProject } from "./watch.js";

export type OpenApiVitePluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export type OpenApiVitePlugin = {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
};

export type GenerationAdaptersFactory = () => GenerationAdapters;

export function createOpenApiVitePlugin(
  createGenerationAdapters: GenerationAdaptersFactory,
  options: OpenApiVitePluginOptions = {},
): OpenApiVitePlugin {
  let stopWatching: (() => void) | undefined;

  return {
    name: "next-openapi-gen",
    async buildStart(): Promise<void> {
      await generateProject({
        adapters: createGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    async configureServer(): Promise<void> {
      if (options.watch === false) {
        return;
      }

      stopWatching = await watchProject({
        adapters: createGenerationAdapters(),
        configPath: options.configPath,
      });
    },
    closeBundle(): void {
      stopWatching?.();
    },
  };
}
