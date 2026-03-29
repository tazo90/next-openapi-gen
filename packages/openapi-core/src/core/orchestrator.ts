import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { createDocumentFromTemplate } from "../openapi/document.js";
import { getOpenApiVersionProcessor } from "../openapi/version-processor.js";
import { loadCustomOpenApiFragments } from "../schema/core/custom-schema-file-processor.js";
import { FrameworkKind } from "../shared/types.js";
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
import type { FrameworkSourceFactory } from "./adapters.js";
import type { GeneratorHooks } from "./config/types.js";
import type { SharedGenerationRuntime } from "./runtime.js";

export type OrchestratorPerformanceProfile = {
  prepareTemplateMs: number;
  loadCustomFragmentsMs: number;
  prepareDocumentMs: number;
  scanRouteFilesMs: number;
  processRouteFilesMs: number;
  buildOperationsMs: number;
  scanRoutesMs: number;
  sortAndMergePathsMs: number;
  buildPathsMs: number;
  defaultComponentsAndErrorsMs: number;
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
  createFrameworkSource,
}: {
  config: ResolvedOpenApiConfig;
  template: OpenApiTemplate;
  hooks?: GeneratorHooks | undefined;
  runtime?: SharedGenerationRuntime | undefined;
  createFrameworkSource: FrameworkSourceFactory;
}): OrchestratorResult {
  const diagnostics = new DiagnosticsCollector();
  const routeProcessor = new RouteProcessor(config, diagnostics, runtime, createFrameworkSource);
  const generationStartedAt = performance.now();
  const profile: OrchestratorPerformanceProfile = {
    prepareTemplateMs: 0,
    loadCustomFragmentsMs: 0,
    prepareDocumentMs: 0,
    scanRouteFilesMs: 0,
    processRouteFilesMs: 0,
    buildOperationsMs: 0,
    scanRoutesMs: 0,
    sortAndMergePathsMs: 0,
    buildPathsMs: 0,
    defaultComponentsAndErrorsMs: 0,
    mergeSchemasMs: 0,
    finalizeDocumentMs: 0,
    totalMs: 0,
  };

  hooks?.configLoaded?.({ config });

  let phaseStartedAt = performance.now();
  const document = createDocumentFromTemplate(template);
  profile.prepareTemplateMs = performance.now() - phaseStartedAt;

  phaseStartedAt = performance.now();
  const schemaFiles = config.schemaFiles ?? [];
  if (schemaFiles.length > 0) {
    const customOpenApiFragments = loadCustomOpenApiFragments(schemaFiles);
    mergeDocumentFragment(document, customOpenApiFragments);
  }
  profile.loadCustomFragmentsMs = performance.now() - phaseStartedAt;
  profile.prepareDocumentMs = profile.prepareTemplateMs + profile.loadCustomFragmentsMs;

  phaseStartedAt = performance.now();
  const routeScanProfile = routeProcessor.scanRoutes();
  profile.scanRouteFilesMs = routeScanProfile.scanRouteFilesMs;
  profile.processRouteFilesMs = routeScanProfile.processRouteFilesMs;
  profile.buildOperationsMs = routeScanProfile.buildOperationsMs;
  profile.scanRoutesMs =
    profile.scanRouteFilesMs + profile.processRouteFilesMs + profile.buildOperationsMs;

  phaseStartedAt = performance.now();
  document.paths = {
    ...document.paths,
    ...routeProcessor.getPaths(),
  };
  document.tags = mergeTagDefinitions(document.tags, routeProcessor.getTags());
  profile.sortAndMergePathsMs = performance.now() - phaseStartedAt;
  profile.buildPathsMs = profile.sortAndMergePathsMs;

  hooks?.routesDiscovered?.({
    config,
    paths: document.paths ?? {},
    tags: document.tags ?? [],
    diagnostics: diagnostics.getAll(),
  });

  phaseStartedAt = performance.now();
  if (!document.servers || document.servers.length === 0) {
    document.servers = [
      {
        url: document.basePath || getDefaultServerUrl(config),
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
  profile.defaultComponentsAndErrorsMs = performance.now() - phaseStartedAt;

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

function getDefaultServerUrl(config: ResolvedOpenApiConfig): string {
  if (config.framework.kind !== FrameworkKind.Nextjs) {
    return "";
  }

  const normalizedApiDir = config.apiDir
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
  const routeRootSegment = config.framework.router === "pages" ? "/pages/" : "/app/";
  const routeRootIndex = normalizedApiDir.lastIndexOf(routeRootSegment);

  if (routeRootIndex === -1) {
    return "";
  }

  const routeBasePath = normalizedApiDir.slice(routeRootIndex + routeRootSegment.length);
  return routeBasePath ? `/${routeBasePath}` : "";
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
