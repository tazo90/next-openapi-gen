import path from "path";
import fs from "fs";

import { DEFAULT_GENERATE_TEMPLATE_PATH } from "../config/defaults.js";
import { normalizeOpenApiConfig } from "../config/normalize.js";
import { runGenerationOrchestrator } from "../core/orchestrator.js";
import type { OrchestratorPerformanceProfile } from "../core/orchestrator.js";
import type { GenerationAdapters } from "../core/adapters.js";
import type { NextOpenApiConfigFile } from "../core/config/types.js";
import type { SharedGenerationRuntime } from "../core/runtime.js";
import { getErrorMessage } from "../shared/error.js";
import { logger } from "../shared/logger.js";
import type {
  OpenApiDocument,
  OpenApiConfig,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
} from "../shared/types.js";

type OpenApiGeneratorOptions = {
  adapters: GenerationAdapters;
  templatePath?: string;
  config?: OpenApiTemplate | OpenApiConfig | NextOpenApiConfigFile;
  runtime?: SharedGenerationRuntime | undefined;
};

export type GeneratorPerformanceProfile = OrchestratorPerformanceProfile;

export class OpenApiGenerator {
  private config: ResolvedOpenApiConfig;
  private template: OpenApiTemplate;
  private diagnostics: ReturnType<typeof runGenerationOrchestrator>["diagnostics"] = [];
  private performanceProfile: GeneratorPerformanceProfile | null = null;
  private runtime: SharedGenerationRuntime | undefined;
  private extendedConfig: NextOpenApiConfigFile | undefined;
  private adapters: GenerationAdapters;

  constructor(opts: OpenApiGeneratorOptions) {
    const templatePath = opts.config
      ? undefined
      : path.resolve(opts.templatePath ?? DEFAULT_GENERATE_TEMPLATE_PATH);
    this.template = opts.config ? toTemplate(opts.config) : readOpenApiTemplate(templatePath!);
    this.config = this.getConfig();
    this.runtime = opts.runtime;
    this.extendedConfig = isExtendedConfigFile(opts.config) ? opts.config : undefined;
    this.adapters = opts.adapters;

    // Initialize logger
    logger.init(this.config);
  }

  public getConfig(): ResolvedOpenApiConfig {
    return normalizeOpenApiConfig(this.template);
  }

  public getDiagnostics() {
    return this.diagnostics;
  }

  public getPerformanceProfile(): GeneratorPerformanceProfile | null {
    return this.performanceProfile;
  }

  public generate(): OpenApiDocument {
    logger.log("Starting OpenAPI generation...");
    const result = runGenerationOrchestrator({
      config: this.config,
      template: this.template,
      hooks: this.extendedConfig?.hooks,
      runtime: this.runtime,
      createFrameworkSource: this.adapters.createFrameworkSource,
    });
    this.diagnostics = result.diagnostics;
    this.performanceProfile = result.performanceProfile;

    if (process.env.NEXT_OPENAPI_GEN_TIMING === "1") {
      logger.log("Generation timings (ms):", result.performanceProfile);
    }

    logger.log("OpenAPI generation completed");

    return result.document;
  }
}

function isExtendedConfigFile(
  value: OpenApiTemplate | OpenApiConfig | NextOpenApiConfigFile | undefined,
): value is NextOpenApiConfigFile {
  return Boolean(value && typeof value === "object" && "hooks" in value);
}

function toTemplate(
  config: OpenApiTemplate | OpenApiConfig | NextOpenApiConfigFile,
): OpenApiTemplate {
  const template = { ...config } as Record<string, unknown>;
  delete template.clientSdk;
  delete template.docs;
  delete template.generatedDir;
  delete template.hooks;
  delete template.watch;
  return template as OpenApiTemplate;
}

function readOpenApiTemplate(templatePath: string): OpenApiTemplate {
  try {
    return JSON.parse(fs.readFileSync(templatePath, "utf-8")) as OpenApiTemplate;
  } catch (error) {
    throw new Error(
      `Failed to read OpenAPI template at ${templatePath}: ${getErrorMessage(error)}`,
    );
  }
}
