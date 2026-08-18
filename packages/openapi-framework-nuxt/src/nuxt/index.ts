import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { generateProject } from "@workspace/openapi-core/core/generate.js";

import { createNuxtFrameworkSource } from "../frameworks/nuxt/source.js";

export type NuxtOpenApiModuleOptions = {
  configPath?: string | undefined;
};

type NuxtHooks = {
  hook: (name: string, fn: () => void | Promise<void>) => void;
};

export function createNuxtGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createNuxtFrameworkSource,
  };
}

export function createNuxtOpenApiModule(options: NuxtOpenApiModuleOptions = {}): {
  meta: { name: string };
  setup: (_moduleOptions: unknown, nuxt: { hooks: NuxtHooks }) => void;
} {
  return {
    meta: { name: "next-openapi-gen" },
    setup(_moduleOptions: unknown, nuxt: { hooks: NuxtHooks }): void {
      nuxt.hooks.hook("nitro:build:before", async () => {
        await generateProject({
          adapters: createNuxtGenerationAdapters(),
          configPath: options.configPath,
        });
      });
    },
  };
}
