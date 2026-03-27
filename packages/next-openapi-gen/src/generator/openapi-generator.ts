import path from "path";
import fs from "fs";

import { DEFAULT_GENERATE_TEMPLATE_PATH } from "../config/defaults.js";
import { normalizeOpenApiConfig } from "../config/normalize.js";
import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { loadCustomOpenApiFragments } from "../schema/core/custom-schema-file-processor.js";
import {
  createErrorResponseComponent,
  generateErrorResponsesFromConfig,
} from "./error-responses.js";
import { createDocumentFromTemplate } from "../openapi/document.js";
import { getOpenApiVersionProcessor } from "../openapi/version-processor.js";
import { RouteProcessor } from "../routes/route-processor.js";
import { getErrorMessage } from "../shared/error.js";
import { logger } from "../shared/logger.js";
import type {
  OpenApiDocument,
  OpenApiTagDefinition,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
} from "../shared/types.js";

export type OpenApiGeneratorOptions = {
  templatePath?: string;
};

export type GeneratorPerformanceProfile = {
  prepareDocumentMs: number;
  scanRoutesMs: number;
  buildPathsMs: number;
  mergeSchemasMs: number;
  finalizeDocumentMs: number;
  totalMs: number;
};

export class OpenApiGenerator {
  private config: ResolvedOpenApiConfig;
  private template: OpenApiTemplate;
  private diagnostics = new DiagnosticsCollector();
  private routeProcessor: RouteProcessor;
  private performanceProfile: GeneratorPerformanceProfile | null = null;

  constructor(opts: OpenApiGeneratorOptions = {}) {
    const templatePath = path.resolve(opts.templatePath ?? DEFAULT_GENERATE_TEMPLATE_PATH);

    this.template = readOpenApiTemplate(templatePath);
    this.config = this.getConfig();

    this.routeProcessor = new RouteProcessor(this.config, this.diagnostics);

    // Initialize logger
    logger.init(this.config);
  }

  public getConfig(): ResolvedOpenApiConfig {
    return normalizeOpenApiConfig(this.template);
  }

  public getDiagnostics() {
    return this.diagnostics.getAll();
  }

  public getPerformanceProfile(): GeneratorPerformanceProfile | null {
    return this.performanceProfile;
  }

  public generate(): OpenApiDocument {
    logger.log("Starting OpenAPI generation...");

    const generationStartedAt = performance.now();
    const profile: GeneratorPerformanceProfile = {
      prepareDocumentMs: 0,
      scanRoutesMs: 0,
      buildPathsMs: 0,
      mergeSchemasMs: 0,
      finalizeDocumentMs: 0,
      totalMs: 0,
    };

    let phaseStartedAt = performance.now();
    const document = createDocumentFromTemplate(this.template);
    const schemaFiles = this.config.schemaFiles ?? [];
    const customOpenApiFragments =
      schemaFiles.length > 0 ? loadCustomOpenApiFragments(schemaFiles) : {};
    mergeDocumentFragment(document, customOpenApiFragments);
    profile.prepareDocumentMs = performance.now() - phaseStartedAt;

    phaseStartedAt = performance.now();
    this.routeProcessor.scanRoutes();
    profile.scanRoutesMs = performance.now() - phaseStartedAt;

    phaseStartedAt = performance.now();
    document.paths = {
      ...document.paths,
      ...this.routeProcessor.getPaths(),
    };
    document.tags = mergeTagDefinitions(document.tags, this.routeProcessor.getTags());
    profile.buildPathsMs = performance.now() - phaseStartedAt;

    // Add server URL for examples if not already defined
    if (!document.servers || document.servers.length === 0) {
      document.servers = [
        {
          url: document.basePath || "",
          description: "API server",
        },
      ];
    }

    // Ensure there's a components section if not already defined
    if (!document.components) {
      document.components = {};
    }

    // Add schemas section if not already defined
    if (!document.components.schemas) {
      document.components.schemas = {};
    }

    // Generate error responses using errorConfig or manual definitions
    if (!document.components.responses) {
      document.components.responses = {};
    }

    const errorConfig = this.config.errorConfig;
    if (errorConfig) {
      generateErrorResponsesFromConfig(document, errorConfig);
    } else if (this.config.errorDefinitions) {
      // Use manual definitions (existing logic - if exists)
      const responses = document.components.responses;
      Object.entries(this.config.errorDefinitions).forEach(([code, errorDef]) => {
        responses[code] = createErrorResponseComponent(errorDef);
      });
    }

    // Get defined schemas from the processor
    phaseStartedAt = performance.now();
    const definedSchemas = this.routeProcessor.getSchemaProcessor().getDefinedSchemas();
    if (definedSchemas && Object.keys(definedSchemas).length > 0) {
      document.components.schemas = {
        ...document.components.schemas,
        ...definedSchemas,
      };
    }
    profile.mergeSchemasMs = performance.now() - phaseStartedAt;

    phaseStartedAt = performance.now();
    const openapiSpec = getOpenApiVersionProcessor(this.config.openapiVersion).finalize(document);
    profile.finalizeDocumentMs = performance.now() - phaseStartedAt;
    profile.totalMs = performance.now() - generationStartedAt;
    this.performanceProfile = profile;

    if (process.env.NEXT_OPENAPI_GEN_TIMING === "1") {
      logger.log("Generation timings (ms):", profile);
    }

    logger.log("OpenAPI generation completed");

    return openapiSpec;
  }
}

function mergeDocumentFragment(document: OpenApiDocument, fragment: Partial<OpenApiDocument>) {
  for (const [key, value] of Object.entries(fragment)) {
    if (typeof value === "undefined") {
      continue;
    }

    const existingValue = document[key as keyof OpenApiDocument];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      document[key as keyof OpenApiDocument] = [...existingValue, ...value] as never;
      continue;
    }

    if (isRecord(existingValue) && isRecord(value)) {
      document[key as keyof OpenApiDocument] = mergeRecord(existingValue, value) as never;
      continue;
    }

    document[key as keyof OpenApiDocument] = structuredClone(value) as never;
  }
}

function mergeRecord<T extends Record<string, unknown>>(base: T, fragment: T): T {
  const merged: Record<string, unknown> = structuredClone(base);

  for (const [key, value] of Object.entries(fragment)) {
    const existingValue = merged[key];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      merged[key] = [...existingValue, ...value];
      continue;
    }

    if (isRecord(existingValue) && isRecord(value)) {
      merged[key] = mergeRecord(existingValue, value);
      continue;
    }

    merged[key] = structuredClone(value);
  }

  return merged as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeTagDefinitions(
  existingTags: OpenApiTagDefinition[] | undefined,
  generatedTags: OpenApiTagDefinition[],
): OpenApiTagDefinition[] | undefined {
  if ((!existingTags || existingTags.length === 0) && generatedTags.length === 0) {
    return existingTags;
  }

  const mergedTags = new Map<string, OpenApiTagDefinition>();
  existingTags?.forEach((tag) => {
    mergedTags.set(tag.name, structuredClone(tag));
  });
  generatedTags.forEach((tag) => {
    mergedTags.set(tag.name, {
      ...mergedTags.get(tag.name),
      ...structuredClone(tag),
    });
  });

  return [...mergedTags.values()];
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
