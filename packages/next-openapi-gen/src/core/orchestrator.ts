import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { createDocumentFromTemplate } from "../openapi/document.js";
import { getOpenApiVersionProcessor } from "../openapi/version-processor.js";
import { loadCustomOpenApiFragments } from "../schema/core/custom-schema-file-processor.js";
import type {
  OpenApiDocument,
  OpenApiTagDefinition,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
} from "../shared/types.js";
import { RouteProcessor } from "../routes/route-processor.js";
import {
  createErrorResponseComponent,
  generateErrorResponsesFromConfig,
} from "../generator/error-responses.js";
import type { GeneratorHooks } from "./config/types.js";
import type { SharedGenerationRuntime } from "./runtime.js";

export type OrchestratorPerformanceProfile = {
  prepareDocumentMs: number;
  scanRoutesMs: number;
  buildPathsMs: number;
  mergeSchemasMs: number;
  finalizeDocumentMs: number;
  totalMs: number;
};

export type OrchestratorResult = {
  document: OpenApiDocument;
  diagnostics: ReturnType<DiagnosticsCollector["getAll"]>;
  performanceProfile: OrchestratorPerformanceProfile;
};

export function runGenerationOrchestrator({
  config,
  template,
  hooks,
  runtime,
}: {
  config: ResolvedOpenApiConfig;
  template: OpenApiTemplate;
  hooks?: GeneratorHooks | undefined;
  runtime?: SharedGenerationRuntime | undefined;
}): OrchestratorResult {
  const diagnostics = new DiagnosticsCollector();
  const routeProcessor = new RouteProcessor(config, diagnostics, runtime);
  const generationStartedAt = performance.now();
  const profile: OrchestratorPerformanceProfile = {
    prepareDocumentMs: 0,
    scanRoutesMs: 0,
    buildPathsMs: 0,
    mergeSchemasMs: 0,
    finalizeDocumentMs: 0,
    totalMs: 0,
  };

  hooks?.configLoaded?.({ config });

  let phaseStartedAt = performance.now();
  const document = createDocumentFromTemplate(template);
  const schemaFiles = config.schemaFiles ?? [];
  const customOpenApiFragments =
    schemaFiles.length > 0 ? loadCustomOpenApiFragments(schemaFiles) : {};
  mergeDocumentFragment(document, customOpenApiFragments);
  profile.prepareDocumentMs = performance.now() - phaseStartedAt;

  phaseStartedAt = performance.now();
  routeProcessor.scanRoutes();
  profile.scanRoutesMs = performance.now() - phaseStartedAt;

  phaseStartedAt = performance.now();
  document.paths = {
    ...document.paths,
    ...routeProcessor.getPaths(),
  };
  document.tags = mergeTagDefinitions(document.tags, routeProcessor.getTags());
  profile.buildPathsMs = performance.now() - phaseStartedAt;

  hooks?.routesDiscovered?.({
    config,
    paths: document.paths ?? {},
    tags: document.tags ?? [],
    diagnostics: diagnostics.getAll(),
  });

  if (!document.servers || document.servers.length === 0) {
    document.servers = [
      {
        url: document.basePath || "",
        description: "API server",
      },
    ];
  }

  if (!document.components) {
    document.components = {};
  }

  if (!document.components.schemas) {
    document.components.schemas = {};
  }

  if (!document.components.responses) {
    document.components.responses = {};
  }

  const errorConfig = config.errorConfig;
  if (errorConfig) {
    generateErrorResponsesFromConfig(document, errorConfig);
  } else if (config.errorDefinitions) {
    const responses = document.components.responses;
    Object.entries(config.errorDefinitions).forEach(([code, errorDef]) => {
      responses[code] = createErrorResponseComponent(errorDef);
    });
  }

  phaseStartedAt = performance.now();
  const definedSchemas = routeProcessor.getSchemaProcessor().getDefinedSchemas();
  if (definedSchemas && Object.keys(definedSchemas).length > 0) {
    document.components.schemas = {
      ...document.components.schemas,
      ...definedSchemas,
    };
  }
  profile.mergeSchemasMs = performance.now() - phaseStartedAt;

  phaseStartedAt = performance.now();
  const finalizedDocument = getOpenApiVersionProcessor(config.openapiVersion).finalize(document);
  profile.finalizeDocumentMs = performance.now() - phaseStartedAt;
  profile.totalMs = performance.now() - generationStartedAt;

  hooks?.documentBuilt?.({
    config,
    document: finalizedDocument,
    diagnostics: diagnostics.getAll(),
  });

  return {
    document: finalizedDocument,
    diagnostics: diagnostics.getAll(),
    performanceProfile: profile,
  };
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
