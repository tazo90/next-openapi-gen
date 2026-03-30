import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { generateProject } from "@workspace/openapi-core/core/generate.js";

import { emitNextDocsArtifact } from "../frameworks/next/docs-page-processor.js";
import { createNextFrameworkSource } from "../frameworks/next/source.js";

export type NextAdapterLike = {
  name: string;
  onBuildComplete?: () => Promise<void> | void;
};

export type NextOpenApiAdapterOptions = {
  configPath?: string | undefined;
};

export function createNextGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createNextFrameworkSource,
    emitDocsArtifact: emitNextDocsArtifact,
  };
}

export function createNextOpenApiAdapter(options: NextOpenApiAdapterOptions = {}): NextAdapterLike {
  return {
    name: "next-openapi-gen",
    async onBuildComplete() {
      await generateProject({
        adapters: createNextGenerationAdapters(),
        configPath: options.configPath,
      });
    },
  };
}

export function withNextOpenApi<T extends Record<string, unknown>>(
  nextConfig: T,
  _options: NextOpenApiAdapterOptions = {},
): T {
  return nextConfig;
}
