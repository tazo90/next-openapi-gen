import fs from "node:fs";
import path from "node:path";

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

function createGeneratedAdapterModule(options: NextOpenApiAdapterOptions): string {
  const adapterPath = path.join(process.cwd(), ".openapi-gen", "next-openapi.adapter.mjs");
  const source = [
    'import { createNextOpenApiAdapter } from "next-openapi-gen/next";',
    "",
    `export default createNextOpenApiAdapter(${JSON.stringify(options)});`,
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });

  if (!fs.existsSync(adapterPath) || fs.readFileSync(adapterPath, "utf8") !== source) {
    fs.writeFileSync(adapterPath, source);
  }

  return adapterPath;
}

export function withNextOpenApi<T extends Record<string, unknown>>(
  nextConfig: T,
  options: NextOpenApiAdapterOptions = {},
): T {
  const configuredAdapterPath =
    typeof nextConfig.adapterPath === "string"
      ? nextConfig.adapterPath
      : typeof nextConfig.experimental === "object" &&
          nextConfig.experimental &&
          "adapterPath" in nextConfig.experimental &&
          typeof nextConfig.experimental.adapterPath === "string"
        ? nextConfig.experimental.adapterPath
        : undefined;

  if (configuredAdapterPath) {
    return nextConfig;
  }

  const adapterPath = createGeneratedAdapterModule(options);

  return {
    ...nextConfig,
    adapterPath,
  };
}
