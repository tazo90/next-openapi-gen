import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

import { createHonoFrameworkSource } from "../frameworks/hono/source.js";

export type HonoOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createHonoGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createHonoFrameworkSource,
  };
}

export function createHonoOpenApiPlugin(options: HonoOpenApiPluginOptions = {}): {
  name: string;
  buildStart(): Promise<void>;
  configureServer(): Promise<void>;
  closeBundle(): void;
} {
  return createOpenApiVitePlugin(createHonoGenerationAdapters, options);
}
