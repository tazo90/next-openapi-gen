import { createArazzoEmitter } from "@workspace/openapi-arazzo";
import type { GenerationAdapters, SpecEmitter } from "@workspace/openapi-core/core/adapters.js";
import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import type { FrameworkSource } from "@workspace/openapi-core/frameworks/types.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createAstroFrameworkSource } from "@workspace/openapi-framework-astro";
import { createExpressFrameworkSource } from "@workspace/openapi-framework-express";
import { createHonoFrameworkSource } from "@workspace/openapi-framework-hono";
import { createNextFrameworkSource, emitNextDocsArtifact } from "@workspace/openapi-framework-next";
import { createNuxtFrameworkSource } from "@workspace/openapi-framework-nuxt";
import { createReactRouterFrameworkSource } from "@workspace/openapi-framework-react-router";
import { createRemixFrameworkSource } from "@workspace/openapi-framework-remix";
import { createSvelteKitFrameworkSource } from "@workspace/openapi-framework-sveltekit";
import { createTanStackFrameworkSource } from "@workspace/openapi-framework-tanstack";
import { createOverlayEmitter } from "@workspace/openapi-overlay";

export function createDefaultGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource(
      config: ResolvedOpenApiConfig,
      performanceProfile?: GenerationPerformanceProfile,
    ): FrameworkSource {
      const kind = config.framework.kind;
      switch (kind) {
        case FrameworkKind.Nextjs:
          return createNextFrameworkSource(config, performanceProfile);
        case FrameworkKind.Tanstack:
          return createTanStackFrameworkSource(config, performanceProfile);
        case FrameworkKind.ReactRouter:
          return createReactRouterFrameworkSource(config, performanceProfile);
        case FrameworkKind.Remix:
          return createRemixFrameworkSource(config, performanceProfile);
        case FrameworkKind.SvelteKit:
          return createSvelteKitFrameworkSource(config, performanceProfile);
        case FrameworkKind.Nuxt:
          return createNuxtFrameworkSource(config, performanceProfile);
        case FrameworkKind.Astro:
          return createAstroFrameworkSource(config, performanceProfile);
        case FrameworkKind.Hono:
          return createHonoFrameworkSource(config, performanceProfile);
        case FrameworkKind.Express:
          return createExpressFrameworkSource(config, performanceProfile);
        default: {
          const exhaustive: never = kind;
          throw new Error(`Unknown framework kind "${String(exhaustive)}"`);
        }
      }
    },
    emitDocsArtifact: emitNextDocsArtifact,
    createSpecEmitters(config) {
      const emitters: SpecEmitter[] = [];
      if (config.overlay) {
        emitters.push(createOverlayEmitter());
      }
      if (config.arazzo) {
        emitters.push(createArazzoEmitter());
      }
      return emitters;
    },
  };
}
