import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

import { createRemixFrameworkSource } from "../frameworks/remix/source.js";

export type RemixOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createRemixGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createRemixFrameworkSource,
  };
}

export function createRemixOpenApiPlugin(options: RemixOpenApiPluginOptions = {}): {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
} {
  return createOpenApiVitePlugin(createRemixGenerationAdapters, options);
}
