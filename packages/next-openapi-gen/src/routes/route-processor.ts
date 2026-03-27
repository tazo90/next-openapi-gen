import fs from "fs";

import { normalizeOpenApiConfig } from "../config/normalize.js";
import type { DiagnosticsCollector } from "../diagnostics/collector.js";
import { createFrameworkAdapter } from "../frameworks/index.js";
import type { FrameworkAdapter } from "../frameworks/types.js";
import { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import { extractPathParameters } from "../shared/utils.js";
import { logger } from "../shared/logger.js";
import type {
  DataTypes,
  OpenApiConfig,
  OpenApiPathDefinition,
  ResolvedOpenApiConfig,
  RouteDefinition,
} from "../shared/types.js";
import { OperationProcessor } from "./operation-processor.js";
import { sortPathDefinitions } from "./path-sort.js";
import { ResponseProcessor } from "./response-processor.js";
import { scanRouteFiles } from "./route-scanner.js";

export class RouteProcessor {
  private pathDefinitions: Record<string, OpenApiPathDefinition> = {};
  private schemaProcessor: SchemaProcessor;
  private config: ResolvedOpenApiConfig;
  private adapter: FrameworkAdapter;
  private ignoreRouteMatchers: RegExp[];
  private diagnostics: DiagnosticsCollector | undefined;
  private responseProcessor: ResponseProcessor;
  private operationProcessor: OperationProcessor;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processFileTracker: Record<string, boolean> = {};

  constructor(config: OpenApiConfig | ResolvedOpenApiConfig, diagnostics?: DiagnosticsCollector) {
    this.config = normalizeOpenApiConfig(config);
    this.diagnostics = diagnostics;
    this.schemaProcessor = new SchemaProcessor(
      this.config.schemaDir,
      this.config.schemaBackends,
      this.config.schemaFiles,
      this.config.apiDir,
    );
    this.adapter = createFrameworkAdapter(this.config);
    this.ignoreRouteMatchers = (this.config.ignoreRoutes || []).map((pattern) => {
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/\//g, "\\/");
      return new RegExp(`^${regexPattern}$`);
    });
    this.responseProcessor = new ResponseProcessor(this.config, this.schemaProcessor);
    this.operationProcessor = new OperationProcessor(this.schemaProcessor, this.responseProcessor);
  }

  private processResponsesFromConfig(
    dataTypes: DataTypes,
    method: string,
  ): RouteDefinition["responses"] {
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

  /**
   * Register a discovered route after filtering
   */
  private registerRoute(
    method: string,
    filePath: string,
    routePath: string,
    dataTypes: DataTypes,
  ): void {
    if (this.shouldIgnoreRoute(routePath, dataTypes)) {
      logger.debug(`Ignoring route: ${routePath}`);
      return;
    }

    if (this.config.includeOpenApiRoutes && !dataTypes.isOpenApi) {
      return;
    }

    const pathParams = extractPathParameters(routePath);
    if (pathParams.length > 0 && !dataTypes.pathParamsType) {
      this.diagnostics?.add({
        code: "missing-path-params-type",
        severity: "warning",
        message: `Route ${routePath} contains path parameters ${pathParams.join(", ")} but no @pathParams type is defined.`,
        filePath,
        routePath,
      });
      logger.debug(
        `Route ${routePath} contains path parameters ${pathParams.join(
          ", ",
        )} but no @pathParams type is defined.`,
      );
    }

    this.addRouteToPaths(method, routePath, dataTypes, pathParams);
  }

  public scanApiRoutes(dir: string): void {
    logger.debug(`Scanning API routes in: ${dir}`);
    scanRouteFiles(
      dir,
      this.adapter,
      {
        directoryCache: this.directoryCache,
        statCache: this.statCache,
        processFileTracker: this.processFileTracker,
      },
      (filePath) => {
        this.adapter
          .processFile(filePath)
          .forEach(({ method, filePath: routeFilePath, routePath, dataTypes }) => {
            this.registerRoute(method, routeFilePath, routePath, dataTypes);
          });
      },
    );
  }

  public scanRoutes(): void {
    this.adapter.getScanRoots().forEach((rootDir) => {
      if (fs.existsSync(rootDir)) {
        this.scanApiRoutes(rootDir);
      }
    });
  }

  private addRouteToPaths(
    varName: string,
    discoveredRoutePath: string,
    dataTypes: DataTypes,
    pathParamNames: string[],
  ): void {
    const { routePath, method, definition } = this.operationProcessor.processOperation(
      varName,
      discoveredRoutePath,
      dataTypes,
      pathParamNames,
    );

    if (!this.pathDefinitions[routePath]) {
      this.pathDefinitions[routePath] = {};
    }

    this.pathDefinitions[routePath]![method] = definition;
  }

  public getPaths(): Record<string, OpenApiPathDefinition> {
    return sortPathDefinitions(this.pathDefinitions);
  }

  public getSwaggerPaths(): Record<string, OpenApiPathDefinition> {
    return this.getPaths();
  }
}
