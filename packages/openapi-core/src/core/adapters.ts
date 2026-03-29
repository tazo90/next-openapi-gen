import type { FrameworkSource } from "../frameworks/types.js";
import type { ResolvedOpenApiConfig } from "../shared/types.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import type { GenerationPerformanceProfile } from "./performance.js";

export type FrameworkSourceFactory = (
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
) => FrameworkSource;

export type DocsArtifactEmitter = (context: {
  loadedConfig: LoadedConfigFile;
  outputFile: string;
}) => Promise<GeneratedArtifact | null>;

export type GenerationAdapters = {
  createFrameworkSource: FrameworkSourceFactory;
  emitDocsArtifact?: DocsArtifactEmitter | undefined;
};
