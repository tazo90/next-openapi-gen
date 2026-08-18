import path from "node:path";

import type { DocsArtifactEmitter } from "@workspace/openapi-core/core/adapters.js";
import type {
  DocsEmitterConfig,
  GeneratedArtifact,
  NextOpenApiConfigFile,
} from "@workspace/openapi-core/core/config/types.js";
import { FrameworkKind, type LegacyFrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createDocsPage } from "@workspace/openapi-init/init/create-docs-page.js";
import type { InitFramework } from "@workspace/openapi-init/init/framework.js";

export async function createNextDocsPage(
  docsUrl: string,
  ui: string,
  outputFile: string,
): Promise<string | null> {
  return await createDocsPage({
    framework: "next",
    docsUrl,
    ui,
    outputFile,
  });
}

export const emitNextDocsArtifact: DocsArtifactEmitter = async ({
  loadedConfig,
  outputFile,
}): Promise<GeneratedArtifact | null> => {
  if (loadedConfig.config.docs?.enabled !== true) {
    return null;
  }

  const docsPath = await createDocsPage({
    framework: resolveDocsPageFramework(loadedConfig.config),
    docsUrl: loadedConfig.config.docsUrl ?? "api-docs",
    ui: loadedConfig.config.ui ?? "scalar",
    outputFile,
  });

  if (!docsPath) {
    return null;
  }

  return {
    kind: "docs",
    path: path.resolve(process.cwd(), docsPath),
  };
};

function resolveDocsPageFramework(config: NextOpenApiConfigFile): InitFramework {
  const docsFramework = config.docs?.framework;
  if (docsFramework !== undefined) {
    return mapDocsEmitterFramework(docsFramework);
  }

  return mapProjectFrameworkToDocsPage(config.framework?.kind);
}

const DOCS_EMITTER_FRAMEWORKS = {
  next: "next",
  vite: "tanstack",
  "react-router": "react-router",
  remix: "remix",
  sveltekit: "sveltekit",
  nuxt: "nuxt",
  astro: "astro",
  hono: "hono",
  express: "express",
} as const satisfies Record<NonNullable<DocsEmitterConfig["framework"]>, InitFramework>;

const PROJECT_FRAMEWORK_TO_DOCS_PAGE = {
  [FrameworkKind.Nextjs]: "next",
  [FrameworkKind.Tanstack]: "tanstack",
  [FrameworkKind.ReactRouter]: "react-router",
  [FrameworkKind.Remix]: "remix",
  [FrameworkKind.SvelteKit]: "sveltekit",
  [FrameworkKind.Nuxt]: "nuxt",
  [FrameworkKind.Astro]: "astro",
  [FrameworkKind.Hono]: "hono",
  [FrameworkKind.Express]: "express",
  next: "next",
  "react-router": "react-router",
} as const satisfies Record<FrameworkKind | LegacyFrameworkKind, InitFramework>;

function mapDocsEmitterFramework(
  framework: NonNullable<DocsEmitterConfig["framework"]>,
): InitFramework {
  return DOCS_EMITTER_FRAMEWORKS[framework];
}

function mapProjectFrameworkToDocsPage(
  kind: FrameworkKind | LegacyFrameworkKind | undefined,
): InitFramework {
  if (kind === undefined) {
    return "next";
  }

  return PROJECT_FRAMEWORK_TO_DOCS_PAGE[kind];
}
