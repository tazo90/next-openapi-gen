import type { DiagnosticsCollector } from "../diagnostics/collector.js";
import type { FrameworkSource } from "../frameworks/types.js";
import type { OpenApiDocument, ResolvedOpenApiConfig } from "../shared/types.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import type { GenerationIR } from "./generation-ir.js";
import type { GenerationPerformanceProfile } from "./performance.js";

export type FrameworkSourceFactory = (
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
) => FrameworkSource;

export type DocsArtifactEmitter = (context: {
  loadedConfig: LoadedConfigFile;
  outputFile: string;
}) => Promise<GeneratedArtifact | null>;

export type SpecEmitterKind = "openapi" | "arazzo" | "overlay";

export type GenerationContext = {
  config: ResolvedOpenApiConfig;
  ir: GenerationIR;
  openapiDocument: OpenApiDocument;
  diagnostics: DiagnosticsCollector;
  outputFile: string;
  outputDir: string;
  cwd: string;
};

export type SpecEmitter = {
  readonly kind: SpecEmitterKind;
  emit(context: GenerationContext): Promise<GeneratedArtifact[]>;
};

export type GenerationAdapters = {
  createFrameworkSource: FrameworkSourceFactory;
  emitDocsArtifact?: DocsArtifactEmitter | undefined;
  createSpecEmitters?: ((config: ResolvedOpenApiConfig) => SpecEmitter[]) | undefined;
};
