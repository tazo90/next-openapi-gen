import {
  OpenApiGenerator as CoreOpenApiGenerator,
  generateProject as coreGenerateProject,
  watchProject as coreWatchProject,
} from "@workspace/openapi-core";

import { createDefaultGenerationAdapters } from "./default-adapters.js";

export { buildProgram } from "@workspace/openapi-cli";
export { defineConfig } from "@workspace/openapi-core";
export {
  DEFAULT_CONFIG_FILENAMES,
  LEGACY_CONFIG_FILENAMES,
  loadConfig,
  MODERN_CONFIG_FILENAMES,
} from "@workspace/openapi-core";
export type {
  ClientSdkEmitterConfig,
  DocsEmitterConfig,
  GeneratedArtifact,
  GeneratorPerformanceProfile,
  GeneratorHooks,
  GeneratorWatchConfig,
  LoadedConfigFile,
  NextOpenApiConfigFile,
  Diagnostic,
  OpenApiDocument,
  OpenApiTemplate,
} from "@workspace/openapi-core";
export { resolveGeneratedWorkspaceDir } from "@workspace/openapi-core";
export { FrameworkKind } from "@workspace/openapi-core";

type CoreGeneratorOptions = ConstructorParameters<typeof CoreOpenApiGenerator>[0];
type CoreGenerateProjectOptions = NonNullable<Parameters<typeof coreGenerateProject>[0]>;
type CoreWatchProjectOptions = NonNullable<Parameters<typeof coreWatchProject>[0]>;

export type OpenApiGeneratorOptions = Omit<CoreGeneratorOptions, "adapters">;
export type GenerateProjectOptions = Omit<CoreGenerateProjectOptions, "adapters">;
export type WatchProjectOptions = Omit<CoreWatchProjectOptions, "adapters">;

export class OpenApiGenerator extends CoreOpenApiGenerator {
  constructor(options: OpenApiGeneratorOptions = {}) {
    super({
      ...options,
      adapters: createDefaultGenerationAdapters(),
    });
  }
}

export function generateProject(options: GenerateProjectOptions = {}) {
  return coreGenerateProject({
    ...options,
    adapters: createDefaultGenerationAdapters(),
  });
}

export function watchProject(options: WatchProjectOptions = {}) {
  return coreWatchProject({
    ...options,
    adapters: createDefaultGenerationAdapters(),
  });
}
