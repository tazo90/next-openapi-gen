import fs from "fs";

import { normalizeOpenApiConfig } from "../config/normalize.js";
import type { FrameworkSourceFactory } from "../core/adapters.js";
import { measurePerformance, type GenerationPerformanceProfile } from "../core/performance.js";
import type { CachedRouteFragment, SharedGenerationRuntime } from "../core/runtime.js";
import type { DiagnosticsCollector } from "../diagnostics/collector.js";
import type { FrameworkSource } from "../frameworks/types.js";
import { setPathItemOperation } from "../openapi/path-item.js";
import { isRegisteredTagKind } from "../openapi/registries/index.js";
import { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import { logger } from "../shared/logger.js";
import type {
  DataTypes,
  OpenApiConfig,
  OpenApiOperation,
  OpenApiPathItem,
  OpenApiTag,
  ResolvedOpenApiConfig,
} from "../shared/types.js";
import { capitalize, extractPathParameters, resolveAnnotationTypeName } from "../shared/utils.js";
import { OperationProcessor } from "./operation-processor.js";
import { sortPathDefinitions } from "./path-sort.js";
import { ResponseProcessor } from "./response-processor.js";
import { collectRouteFiles } from "./route-scanner.js";

export type RouteScanPerformanceProfile = {
  scanRouteFilesMs: number;
  processRouteFilesMs: number;
  buildOperationsMs: number;
};

export class RouteProcessor {
  private pathDefinitions: Record<string, OpenApiPathItem> = {};
  private webhookDefinitions: Record<string, OpenApiPathItem> = {};
  private tagDefinitions: Record<string, OpenApiTag> = {};
  private cachedSchemaDefinitions: Record<string, any> = {};
  private cachedInternalSchemaDefinitions: Record<string, any> = {};
  private schemaProcessor: SchemaProcessor;
  private config: ResolvedOpenApiConfig;
  private source: FrameworkSource;
  private ignoreRouteMatchers: RegExp[];
  private diagnostics: DiagnosticsCollector | undefined;
  private responseProcessor: ResponseProcessor;
  private operationProcessor: OperationProcessor;
  private performanceProfile: GenerationPerformanceProfile | undefined;
  private runtime: SharedGenerationRuntime | undefined;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processFileTracker: Record<string, boolean> = {};

  constructor(
    config: OpenApiConfig | ResolvedOpenApiConfig,
    diagnostics?: DiagnosticsCollector,
    runtime?: SharedGenerationRuntime,
    createFrameworkSource?: FrameworkSourceFactory,
    performanceProfile?: GenerationPerformanceProfile,
  ) {
    this.config = normalizeOpenApiConfig(config);
    this.diagnostics = diagnostics;
    this.performanceProfile = performanceProfile;
    this.runtime = runtime;
    if (runtime) {
      this.directoryCache = runtime.routeScan.directoryCache;
      this.statCache = runtime.routeScan.statCache;
    }
    this.schemaProcessor = new SchemaProcessor(
      this.config.schemaDir,
      this.config.schemaBackends,
      this.config.schemaFiles,
      this.config.apiDir,
      undefined,
      runtime,
      this.diagnostics,
      this.performanceProfile,
    );
    this.source = (createFrameworkSource ?? missingFrameworkSourceFactory)(
      this.config,
      this.performanceProfile,
    );
    this.ignoreRouteMatchers = (this.config.ignoreRoutes || []).map((pattern) => {
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/\//g, "\\/");
      return new RegExp(`^${regexPattern}$`);
    });
    this.responseProcessor = new ResponseProcessor(this.config, this.schemaProcessor);
    this.operationProcessor = new OperationProcessor(this.schemaProcessor, this.responseProcessor, {
      authPresets: this.config.authPresets,
      diagnostics: this.diagnostics,
      performanceProfile: this.performanceProfile,
    });
  }

  private processResponsesFromConfig(
    dataTypes: DataTypes,
    method: string,
  ): OpenApiOperation["responses"] {
    return this.responseProcessor.processResponses(dataTypes, method);
  }

  /**
   * Get the SchemaProcessor instance
   */
  public getSchemaProcessor(): SchemaProcessor {
    return this.schemaProcessor;
  }

  /**
   * Check if a route should be ignored based on config patterns or @ignore tag
   */
  private shouldIgnoreRoute(routePath: string, dataTypes: DataTypes): boolean {
    // Check if route has @ignore tag
    if (dataTypes.isIgnored) {
      return true;
    }

    // Check if route matches any ignore patterns
    if (this.ignoreRouteMatchers.length === 0) {
      return false;
    }

    return this.ignoreRouteMatchers.some((regex) => regex.test(routePath));
  }

  private shouldIgnoreRoutePath(routePath: string): boolean {
    if (this.ignoreRouteMatchers.length === 0) {
      return false;
    }

    return this.ignoreRouteMatchers.some((regex) => regex.test(routePath));
  }

  /**
   * Register a discovered route after filtering
   */
  private registerRoute(
    method: string,
    filePath: string,
    routePathOrDataTypes: string | DataTypes,
    maybeDataTypes?: DataTypes,
  ): void {
    const routePath =
      typeof routePathOrDataTypes === "string"
        ? routePathOrDataTypes
        : this.source.getRoutePath(filePath);
    const dataTypes =
      (typeof routePathOrDataTypes === "string" ? maybeDataTypes : routePathOrDataTypes) ||
      ({} as DataTypes);

    if (this.shouldIgnoreRoute(routePath, dataTypes)) {
      logger.debug(`Ignoring route: ${routePath}`);
      return;
    }

    dataTypes.diagnostics?.forEach((diagnostic) => {
      this.diagnostics?.add({
        ...diagnostic,
        filePath: diagnostic.filePath || filePath,
        routePath: diagnostic.routePath || routePath,
      });
    });

    if (this.config.includeOpenApiRoutes && !dataTypes.isOpenApi) {
      return;
    }

    const pathParams = extractPathParameters(routePath);
    this.registerTagMetadata(filePath, routePath, dataTypes);
    this.registerRouteFeatureDiagnostics(filePath, routePath, dataTypes);
    if (
      pathParams.length > 0 &&
      !resolveAnnotationTypeName(dataTypes.pathParamsType) &&
      !resolveAnnotationTypeName(dataTypes.inferredPathParamsType) &&
      !this.canAutoWirePathParams(routePath, pathParams)
    ) {
      this.diagnostics?.add({
        code: "missing-path-params-type",
        severity: "warning",
        message: `Route ${routePath} contains path parameters ${pathParams.join(", ")} but no @path type is defined.`,
        filePath,
        routePath,
        metadata: {
          pathParams,
          suggestedFix:
            "Add @path <SchemaName>, validate context.params in the handler, or export matching <paramName>Schema helpers.",
        },
      });
      logger.debug(
        `Route ${routePath} contains path parameters ${pathParams.join(
          ", ",
        )} but no @path type is defined.`,
      );
    }

    this.addRouteToPaths(method, routePath, dataTypes, pathParams, filePath);
  }

  private canAutoWirePathParams(routePath: string, pathParams: string[]): boolean {
    const hasSchemaCandidate =
      "hasSchemaCandidate" in this.schemaProcessor
        ? this.schemaProcessor.hasSchemaCandidate.bind(this.schemaProcessor)
        : undefined;
    if (!hasSchemaCandidate) {
      return false;
    }

    const rootPath = capitalize(routePath.split("/")[1] || "");
    const objectCandidates = [
      `${rootPath}PathParamsSchema`,
      `${rootPath}ParamsSchema`,
      ...pathParams.map((name) => `${capitalize(name)}ParamsSchema`),
    ];
    if (objectCandidates.some((candidate) => hasSchemaCandidate(candidate))) {
      return true;
    }

    return pathParams.every((name) =>
      [`${name}Schema`, `${capitalize(name)}Schema`].some((candidate) =>
        hasSchemaCandidate(candidate),
      ),
    );
  }

  public scanApiRoutes(dir: string): RouteScanPerformanceProfile {
    logger.debug(`Scanning API routes in: ${dir}`);
    const { filePaths, scanRouteFilesMs } = collectRouteFiles(dir, this.source, {
      directoryCache: this.directoryCache,
      statCache: this.statCache,
      processFileTracker: this.processFileTracker,
    });
    let processRouteFilesMs = 0;
    let buildOperationsMs = 0;

    filePaths.forEach((filePath) => {
      const routePath = measurePerformance(this.performanceProfile, "deriveRoutePathMs", () =>
        this.source.getRoutePath(filePath),
      );
      const shouldSkipCandidate = measurePerformance(
        this.performanceProfile,
        "filterRouteCandidatesMs",
        () => this.shouldIgnoreRoutePath(routePath),
      );
      if (shouldSkipCandidate) {
        logger.debug(`Ignoring route candidate before analysis: ${routePath}`);
        return;
      }

      const shouldAnalyzeFile = measurePerformance(
        this.performanceProfile,
        "sourcePrecheckMs",
        () => this.source.precheckFile(filePath),
      );
      if (!shouldAnalyzeFile) {
        logger.debug(`Skipping route candidate after precheck: ${routePath}`);
        return;
      }

      const cachedFragment = this.getReusableRouteFragment(filePath, routePath);
      if (cachedFragment) {
        this.applyRouteFragment(cachedFragment);
        return;
      }

      let phaseStartedAt = performance.now();
      const discoveredRoutes = this.source.processFile(filePath, routePath);
      processRouteFilesMs += performance.now() - phaseStartedAt;

      phaseStartedAt = performance.now();
      const pathsBefore = structuredClone(this.pathDefinitions);
      const webhooksBefore = structuredClone(this.webhookDefinitions);
      const tagsBefore = structuredClone(this.tagDefinitions);
      const schemasBefore = this.schemaProcessor.getDefinedSchemas();
      const internalSchemasBefore = this.schemaProcessor.getInternalSchemas();
      const diagnosticsBefore = this.diagnostics?.getAll().length ?? 0;
      discoveredRoutes.forEach(({ method, filePath: routeFilePath, routePath, dataTypes }) => {
        measurePerformance(this.performanceProfile, "registerRouteMs", () => {
          this.registerRoute(method, routeFilePath, routePath, dataTypes);
        });
      });
      buildOperationsMs += performance.now() - phaseStartedAt;
      this.writeRouteFragment(filePath, routePath, {
        diagnosticsBefore,
        internalSchemasBefore,
        pathsBefore,
        schemasBefore,
        tagsBefore,
        webhooksBefore,
      });
    });

    return {
      scanRouteFilesMs,
      processRouteFilesMs,
      buildOperationsMs,
    };
  }

  public scanRoutes(): RouteScanPerformanceProfile {
    const profile: RouteScanPerformanceProfile = {
      scanRouteFilesMs: 0,
      processRouteFilesMs: 0,
      buildOperationsMs: 0,
    };

    this.schemaProcessor.preprocessZodSchemas();

    this.source.getScanRoots().forEach((rootDir) => {
      if (fs.existsSync(rootDir)) {
        const routeProfile = this.scanApiRoutes(rootDir);
        profile.scanRouteFilesMs += routeProfile.scanRouteFilesMs;
        profile.processRouteFilesMs += routeProfile.processRouteFilesMs;
        profile.buildOperationsMs += routeProfile.buildOperationsMs;
      }
    });

    return profile;
  }

  private addRouteToPaths(
    varName: string,
    discoveredRoutePath: string,
    dataTypes: DataTypes,
    pathParamNames: string[] = [],
    filePath?: string,
  ): void {
    const normalizedRoutePath =
      discoveredRoutePath.includes("{") || discoveredRoutePath.startsWith("/")
        ? discoveredRoutePath
        : this.source.getRoutePath(discoveredRoutePath);
    const resolvedPathParamNames =
      pathParamNames.length > 0 ? pathParamNames : extractPathParameters(normalizedRoutePath);

    const { routePath, method, definition } = this.operationProcessor.processOperation(
      varName,
      normalizedRoutePath,
      dataTypes,
      resolvedPathParamNames,
      filePath,
    );

    if (dataTypes.isWebhook) {
      const webhookKey = dataTypes.webhookName?.trim() || routePath;
      if (!this.webhookDefinitions[webhookKey]) {
        this.webhookDefinitions[webhookKey] = {};
      }
      setPathItemOperation(this.webhookDefinitions[webhookKey], method, definition);
      return;
    }

    if (!this.pathDefinitions[routePath]) {
      this.pathDefinitions[routePath] = {};
    }

    setPathItemOperation(this.pathDefinitions[routePath], method, definition);
  }

  public getWebhooks(): Record<string, OpenApiPathItem> {
    return sortPathDefinitions(this.webhookDefinitions);
  }

  private getReusableRouteFragment(
    filePath: string,
    routePath: string,
  ): CachedRouteFragment | undefined {
    const fragment = this.runtime?.routeScan.routeFragments.get(filePath);
    if (!fragment) {
      return undefined;
    }

    const stat = fs.statSync(filePath);
    if (
      fragment.mtimeMs !== stat.mtimeMs ||
      fragment.size !== stat.size ||
      fragment.cacheKey !== this.getRouteFragmentCacheKey(routePath)
    ) {
      return undefined;
    }

    return fragment;
  }

  private applyRouteFragment(fragment: CachedRouteFragment): void {
    Object.assign(this.pathDefinitions, structuredClone(fragment.paths));
    Object.assign(this.webhookDefinitions, structuredClone(fragment.webhooks));
    Object.assign(this.tagDefinitions, structuredClone(fragment.tags));
    Object.assign(this.cachedSchemaDefinitions, structuredClone(fragment.schemas));
    Object.assign(this.cachedInternalSchemaDefinitions, structuredClone(fragment.internalSchemas));
    fragment.diagnostics.forEach((diagnostic) => this.diagnostics?.add(diagnostic));
  }

  private writeRouteFragment(
    filePath: string,
    routePath: string,
    previous: {
      diagnosticsBefore: number;
      internalSchemasBefore: Record<string, any>;
      pathsBefore: Record<string, OpenApiPathItem>;
      schemasBefore: Record<string, any>;
      tagsBefore: Record<string, OpenApiTag>;
      webhooksBefore: Record<string, OpenApiPathItem>;
    },
  ): void {
    if (!this.runtime) {
      return;
    }

    const stat = fs.statSync(filePath);
    const currentSchemas = this.schemaProcessor.getDefinedSchemas();
    const currentInternalSchemas = this.schemaProcessor.getInternalSchemas();
    const diagnostics = this.diagnostics?.getAll().slice(previous.diagnosticsBefore) ?? [];

    this.runtime.routeScan.routeFragments.set(filePath, {
      cacheKey: this.getRouteFragmentCacheKey(routePath),
      diagnostics: structuredClone(diagnostics),
      internalSchemas: getSchemaDelta(previous.internalSchemasBefore, currentInternalSchemas),
      mtimeMs: stat.mtimeMs,
      paths: getRecordDelta(previous.pathsBefore, this.pathDefinitions),
      schemas: getSchemaDelta(previous.schemasBefore, currentSchemas),
      size: stat.size,
      tags: getRecordDelta(previous.tagsBefore, this.tagDefinitions),
      webhooks: getRecordDelta(previous.webhooksBefore, this.webhookDefinitions),
    });
  }

  private getRouteFragmentCacheKey(routePath: string): string {
    return JSON.stringify({
      authPresets: this.config.authPresets,
      defaultResponseSet: this.config.defaultResponseSet,
      errorConfig: this.config.errorConfig,
      errorDefinitions: this.config.errorDefinitions,
      excludeSchemas: this.config.excludeSchemas,
      framework: this.config.framework,
      ignoreRoutes: this.config.ignoreRoutes,
      includeOpenApiRoutes: this.config.includeOpenApiRoutes,
      openapiVersion: this.config.openapiVersion,
      responseSets: this.config.responseSets,
      routePath,
      schemaBackends: this.config.schemaBackends,
      schemaFiles: this.config.schemaFiles,
    });
  }

  public getPaths(): Record<string, OpenApiPathItem> {
    return sortPathDefinitions(this.pathDefinitions);
  }

  public getTags(): OpenApiTag[] {
    return Object.values(this.tagDefinitions).toSorted((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
  }

  public getCachedSchemas(): Record<string, any> {
    return this.cachedSchemaDefinitions;
  }

  public getCachedInternalSchemas(): Record<string, any> {
    return this.cachedInternalSchemaDefinitions;
  }

  private registerRouteFeatureDiagnostics(
    filePath: string,
    routePath: string,
    _dataTypes: DataTypes,
  ): void {
    const normalizedFilePath = filePath.replaceAll("\\", "/");
    if (normalizedFilePath.includes("/[[...")) {
      this.diagnostics?.add({
        code: "unsupported-route-feature",
        severity: "info",
        message: `Route ${routePath} uses an optional catch-all segment ([[...]]). OpenAPI path parameters are always required; verify the emitted parameter semantics match your runtime.`,
        filePath,
        routePath,
      });
    }

    if (/\/@[^/]+/.test(normalizedFilePath)) {
      this.diagnostics?.add({
        code: "unsupported-route-feature",
        severity: "info",
        message: `Route ${routePath} uses a parallel route segment (@folder). Parallel route folders are stripped from the generated OpenAPI path.`,
        filePath,
        routePath,
      });
    }

    if (/\/\(\.+[^)]*\)/.test(normalizedFilePath)) {
      this.diagnostics?.add({
        code: "unsupported-route-feature",
        severity: "info",
        message: `Route ${routePath} uses an intercepting route segment. Intercepting route folders are stripped from the generated OpenAPI path.`,
        filePath,
        routePath,
      });
    }
  }

  private registerTagMetadata(filePath: string, routePath: string, dataTypes: DataTypes): void {
    const routeTag = dataTypes.tag || capitalize(routePath.split("/")[1] || "");
    if (!routeTag) {
      return;
    }

    if (dataTypes.tagKind && !isRegisteredTagKind(dataTypes.tagKind)) {
      this.diagnostics?.add({
        code: "unregistered-tag-kind",
        severity: "info",
        message: `Tag kind "${dataTypes.tagKind}" is not in the OAI Tag Kind registry.`,
        filePath,
        routePath,
        metadata: { kind: dataTypes.tagKind },
      });
    }

    const existingTag = this.tagDefinitions[routeTag] || { name: routeTag };
    this.tagDefinitions[routeTag] = {
      ...existingTag,
      ...(dataTypes.tagSummary ? { summary: dataTypes.tagSummary } : {}),
      ...(dataTypes.tagDescription ? { description: dataTypes.tagDescription } : {}),
      ...(dataTypes.tagKind ? { kind: dataTypes.tagKind } : {}),
      ...(dataTypes.tagParent ? { parent: dataTypes.tagParent } : {}),
    };
  }
}

function getSchemaDelta(
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, any> {
  return getRecordDelta(before, after);
}

function getRecordDelta<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
  const delta: Record<string, any> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      delta[key] = value;
    }
  }
  return delta as Record<string, T>;
}

function missingFrameworkSourceFactory(): never {
  throw new Error("A framework source factory is required to scan routes.");
}
