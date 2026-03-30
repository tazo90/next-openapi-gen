import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createNextFrameworkSource, emitNextDocsArtifact } from "@workspace/openapi-framework-next";
import { createReactRouterFrameworkSource } from "@workspace/openapi-framework-react-router";
import { createTanStackFrameworkSource } from "@workspace/openapi-framework-tanstack";

export function createDefaultGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource(config, performanceProfile) {
      switch (config.framework.kind) {
        case FrameworkKind.Nextjs:
          return createNextFrameworkSource(config, performanceProfile);
        case FrameworkKind.Tanstack:
          return createTanStackFrameworkSource(config, performanceProfile);
        case FrameworkKind.ReactRouter:
          return createReactRouterFrameworkSource(config, performanceProfile);
      }
    },
    emitDocsArtifact: emitNextDocsArtifact,
  };
}
