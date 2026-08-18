import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { createOpenApiVitePlugin } from "@workspace/openapi-core/core/vite-plugin.js";

import { createAstroFrameworkSource } from "../frameworks/astro/source.js";

export type AstroOpenApiIntegrationOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createAstroGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createAstroFrameworkSource,
  };
}

export function createAstroOpenApiIntegration(options: AstroOpenApiIntegrationOptions = {}): {
  name: string;
  hooks: {
    "astro:config:setup": (context: {
      updateConfig: (config: { vite: { plugins: unknown[] } }) => void;
    }) => void;
  };
} {
  return {
    name: "next-openapi-gen",
    hooks: {
      "astro:config:setup"(context: {
        updateConfig: (config: { vite: { plugins: unknown[] } }) => void;
      }): void {
        context.updateConfig({
          vite: {
            plugins: [createOpenApiVitePlugin(createAstroGenerationAdapters, options)],
          },
        });
      },
    },
  };
}
