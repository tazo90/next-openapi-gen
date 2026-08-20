import { describe, expect, it } from "vitest";

import { createDefaultGenerationAdapters as createCliDefaultGenerationAdapters } from "@workspace/openapi-cli/default-adapters.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { emitNextDocsArtifact } from "@workspace/openapi-framework-next";

import { createDefaultGenerationAdapters } from "../../../packages/next-openapi-gen/src/default-adapters.ts";

const baseConfig = {
  apiDir: "./src/app/api",
  diagnostics: {
    enabled: true,
  },
  docsUrl: "api-docs",
  ignoreRoutes: [],
  openapiVersion: "3.0",
  outputDir: "./public",
  outputFile: "openapi.json",
  schemaBackends: ["typescript"],
  schemaDir: "./src",
  schemaFiles: [],
  schemaType: "typescript",
  ui: "scalar",
  debug: false,
  includeOpenApiRoutes: false,
} as const;

describe("next-openapi-gen default adapters", () => {
  it("uses the CLI package's concrete default adapter implementation", () => {
    expect(createDefaultGenerationAdapters).toBe(createCliDefaultGenerationAdapters);
  });

  it("routes each framework kind to the matching source factory", () => {
    const adapters = createDefaultGenerationAdapters();

    expect(
      adapters
        .createFrameworkSource({
          ...baseConfig,
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
          next: {},
        })
        .getScanRoots(),
    ).toContain("./src/app/api");

    expect(
      adapters
        .createFrameworkSource({
          ...baseConfig,
          framework: {
            kind: FrameworkKind.Tanstack,
            router: "file-based",
          },
        })
        .getScanRoots(),
    ).toEqual(["./src/app/api"]);

    expect(
      adapters
        .createFrameworkSource({
          ...baseConfig,
          framework: {
            kind: FrameworkKind.ReactRouter,
            router: "file-based",
          },
        })
        .getScanRoots(),
    ).toEqual(["./src/app/api"]);

    for (const kind of [
      FrameworkKind.Remix,
      FrameworkKind.SvelteKit,
      FrameworkKind.Nuxt,
      FrameworkKind.Astro,
      FrameworkKind.Hono,
      FrameworkKind.Express,
    ]) {
      expect(
        adapters
          .createFrameworkSource({
            ...baseConfig,
            framework: {
              kind,
            },
          })
          .getScanRoots(),
      ).toEqual(["./src/app/api"]);
    }
  });

  it("uses the Next docs emitter by default", () => {
    const adapters = createDefaultGenerationAdapters();

    expect(adapters.emitDocsArtifact).toBe(emitNextDocsArtifact);
  });

  it("creates overlay and arazzo emitters only when those config blocks exist", () => {
    const adapters = createDefaultGenerationAdapters();

    expect(adapters.createSpecEmitters?.(baseConfig as never)).toEqual([]);
    expect(
      adapters
        .createSpecEmitters?.({
          ...baseConfig,
          overlay: { apply: ["./overlays/public.overlay.yaml"] },
          arazzo: { files: ["./arazzo/**/*.yaml"] },
        })
        ?.map((emitter) => emitter.kind),
    ).toEqual(["overlay", "arazzo"]);
  });
});
