import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

import { createSvelteKitFrameworkSource } from "../frameworks/sveltekit/source.js";

export type SvelteKitOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createSvelteKitGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createSvelteKitFrameworkSource,
  };
}

export function createSvelteKitOpenApiPlugin(options: SvelteKitOpenApiPluginOptions = {}): {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
} {
  return createOpenApiVitePlugin(createSvelteKitGenerationAdapters, options);
}
