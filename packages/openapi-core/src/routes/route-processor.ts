import fs from "fs";

import { normalizeOpenApiConfig } from "../config/normalize.js";
import type { FrameworkSourceFactory } from "../core/adapters.js";
import { measurePerformance, type GenerationPerformanceProfile } from "../core/performance.js";
import {
  invalidateRuntimeFile,
  type CachedRouteFragment,
  type SharedGenerationRuntime,
} from "../core/runtime.js";
import type { DiagnosticsCollector } from "../diagnostics/collector.js";
import type { FrameworkSource } from "../frameworks/types.js";
import { setPathItemOperation } from "../openapi/path-item.js";
import { isRegisteredTagKind } from "../openapi/registries/index.js";
import { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import { logger } from "../shared/logger.js";
import { capitalize, extractPathParameters, resolveAnnotationTypeName } from "../shared/strings.js";
import type {
  DataTypes,
  OpenApiConfig,
  OpenApiOperation,
  OpenApiPathItem,
  OpenApiTag,
  ResolvedOpenApiConfig,
} from "../shared/types.js";
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
  private ignoredRouteDirectories = new Set<string>();

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
    this.ignoreRouteMatchers = this.config.ignoreRoutes!.map((pattern) => {
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
      (typeof routePathOrDataTypes === "string" ? maybeDataTypes : routePathOrDataTypes) || {};

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
    const { filePaths, scanRouteFilesMs } = collectRouteFiles(
      dir,
      this.source,
      {
        directoryCache: this.directoryCache,
        statCache: this.statCache,
        processFileTracker: this.processFileTracker,
      },
      (directoryPath) => {
        if (this.ignoredRouteDirectories.has(directoryPath)) {
          return;
        }
        this.ignoredRouteDirectories.add(directoryPath);
        this.diagnostics?.add({
          code: "route-directory-ignored",
          severity: "warning",
          message: `Skipped automatically ignored route directory: ${directoryPath}`,
          filePath: directoryPath,
        });
      },
    );
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
      const schemasBefore = this.schemaProcessor.getDefinedSchemas();
      const internalSchemasBefore = this.schemaProcessor.getInternalSchemas();
      const diagnosticsBefore = this.diagnostics?.getAll().length ?? 0;
      const fragment = this.buildRouteFragmentTransaction(
        filePath,
        routePath,
        discoveredRoutes,
        schemasBefore,
        internalSchemasBefore,
        diagnosticsBefore,
      );
      this.applyRouteFragment(fragment, false);
      buildOperationsMs += performance.now() - phaseStartedAt;
      this.runtime?.routeScan.routeFragments.set(filePath, fragment);
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

  private applyRouteFragment(fragment: CachedRouteFragment, addDiagnostics = true): void {
    mergePathDefinitionRecords(this.pathDefinitions, fragment.paths);
    mergePathDefinitionRecords(this.webhookDefinitions, fragment.webhooks);
    mergeTagDefinitionRecords(this.tagDefinitions, fragment.tags);
    Object.assign(this.cachedSchemaDefinitions, structuredClone(fragment.schemas));
    Object.assign(this.cachedInternalSchemaDefinitions, structuredClone(fragment.internalSchemas));
    if (addDiagnostics) {
      fragment.diagnostics.forEach((diagnostic) => this.diagnostics?.add(diagnostic));
    }
  }

  private buildRouteFragmentTransaction(
    filePath: string,
    routePath: string,
    discoveredRoutes: ReturnType<FrameworkSource["processFile"]>,
    schemasBefore: Record<string, any>,
    internalSchemasBefore: Record<string, any>,
    diagnosticsBefore: number,
  ): CachedRouteFragment {
    const accumulatedPaths = this.pathDefinitions;
    const accumulatedWebhooks = this.webhookDefinitions;
    const accumulatedTags = this.tagDefinitions;
    this.pathDefinitions = {};
    this.webhookDefinitions = {};
    this.tagDefinitions = {};

    try {
      discoveredRoutes.forEach(({ method, filePath: routeFilePath, routePath, dataTypes }) => {
        measurePerformance(this.performanceProfile, "registerRouteMs", () => {
          this.registerRoute(method, routeFilePath, routePath, dataTypes);
        });
      });

      const stat = fs.statSync(filePath);
      const internalSchemas = getSchemaDelta(
        internalSchemasBefore,
        this.schemaProcessor.getInternalSchemas(),
      );
      const schemas = getSchemaDelta(schemasBefore, this.schemaProcessor.getDefinedSchemas());
      const schemaDependencies = this.schemaProcessor.getSchemaDependencyFiles(
        {
          ...schemas,
          ...internalSchemas,
          paths: this.pathDefinitions,
          webhooks: this.webhookDefinitions,
        },
        collectRouteSchemaNames(discoveredRoutes),
      );
      return {
        cacheKey: this.getRouteFragmentCacheKey(routePath),
        diagnostics: structuredClone(this.diagnostics?.getAll().slice(diagnosticsBefore) ?? []),
        internalSchemas,
        mtimeMs: stat.mtimeMs,
        paths: this.pathDefinitions,
        schemaDependencies,
        schemas,
        size: stat.size,
        tags: this.tagDefinitions,
        webhooks: this.webhookDefinitions,
      };
    } catch (error) {
      if (this.runtime) {
        invalidateRuntimeFile(this.runtime, filePath);
      }
      throw error;
    } finally {
      this.pathDefinitions = accumulatedPaths;
      this.webhookDefinitions = accumulatedWebhooks;
      this.tagDefinitions = accumulatedTags;
    }
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

function getSchemaDelta<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
  const delta: Record<string, T> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      delta[key] = value;
    }
  }
  return delta;
}

function mergePathDefinitionRecords(
  target: Record<string, OpenApiPathItem>,
  source: Record<string, OpenApiPathItem>,
): void {
  for (const [routePath, pathItem] of Object.entries(source)) {
    target[routePath] = {
      ...target[routePath],
      ...structuredClone(pathItem),
    };
  }
}

function mergeTagDefinitionRecords(
  target: Record<string, OpenApiTag>,
  source: Record<string, OpenApiTag>,
): void {
  for (const [tagName, tag] of Object.entries(source)) {
    target[tagName] = {
      ...(target[tagName] ?? { name: tagName }),
      ...structuredClone(tag),
    };
  }
}

function collectRouteSchemaNames(
  discoveredRoutes: ReturnType<FrameworkSource["processFile"]>,
): Set<string> {
  const names = new Set<string>();
  for (const { dataTypes } of discoveredRoutes) {
    const declaredTypes = [
      dataTypes.pathParamsType,
      dataTypes.paramsType,
      dataTypes.querystringType,
      dataTypes.bodyType,
      dataTypes.headerType,
      dataTypes.cookieType,
      dataTypes.responseType,
      dataTypes.responseItemType,
      dataTypes.requestItemType,
      dataTypes.inferredPathParamsType,
      dataTypes.inferredQueryParamsType,
      dataTypes.inferredBodyType,
      ...(dataTypes.inferredResponses?.flatMap((response) => [
        response.typeName,
        response.itemTypeName,
      ]) ?? []),
    ];
    for (const typeName of declaredTypes) {
      const resolvedName = resolveAnnotationTypeName(typeName);
      if (resolvedName) {
        names.add(resolvedName);
      }
    }
  }
  return names;
}

function missingFrameworkSourceFactory(): never {
  throw new Error("A framework source factory is required to scan routes.");
}
