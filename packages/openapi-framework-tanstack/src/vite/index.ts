import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

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

export function createViteOpenApiPlugin(options: ViteOpenApiPluginOptions = {}): {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
} {
  return createOpenApiVitePlugin(createTanStackGenerationAdapters, options);
}
