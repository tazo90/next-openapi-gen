import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

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
  return createOpenApiVitePlugin(createReactRouterGenerationAdapters, options);
}
