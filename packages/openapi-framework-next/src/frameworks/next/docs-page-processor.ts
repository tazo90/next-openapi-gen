import path from "node:path";

import type { DocsArtifactEmitter } from "@workspace/openapi-core/core/adapters.js";
import type { GeneratedArtifact } from "@workspace/openapi-core/core/config/types.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import { createDocsPage } from "@workspace/openapi-init/init/create-docs-page.js";

export async function createNextDocsPage(
  docsUrl: string,
  ui: string,
  outputFile: string,
): Promise<string | null> {
  return createDocsPage({
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

  if (loadedConfig.config.framework?.kind !== FrameworkKind.Nextjs) {
    return null;
  }

  const docsPath = await createNextDocsPage(
    loadedConfig.config.docsUrl ?? "api-docs",
    loadedConfig.config.ui ?? "scalar",
    outputFile,
  );

  if (!docsPath) {
    return null;
  }

  return {
    kind: "docs",
    path: path.resolve(process.cwd(), docsPath),
  };
};
