import type { FrameworkSource } from "../frameworks/types.js";
import type { ResolvedOpenApiConfig } from "../shared/types.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";

export type FrameworkSourceFactory = (config: ResolvedOpenApiConfig) => FrameworkSource;

export type DocsArtifactEmitter = (context: {
  loadedConfig: LoadedConfigFile;
  outputFile: string;
}) => Promise<GeneratedArtifact | null>;

export type GenerationAdapters = {
  createFrameworkSource: FrameworkSourceFactory;
  emitDocsArtifact?: DocsArtifactEmitter | undefined;
};
