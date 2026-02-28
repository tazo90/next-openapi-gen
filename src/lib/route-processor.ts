import fs from "fs";
import path from "path";

import { SchemaProcessor } from "./schema-processor.js";
import {
  capitalize,
  extractPathParameters,
  getOperationId,
} from "./utils.js";
import { DataTypes, OpenApiConfig, RouteDefinition } from "../types.js";
import { logger } from "./logger.js";
import { RouterStrategy } from "./router-strategy.js";
import { AppRouterStrategy } from "./app-router-strategy.js";
import { PagesRouterStrategy } from "./pages-router-strategy.js";

const MUTATION_HTTP_METHODS = ["PATCH", "POST", "PUT"];

export class RouteProcessor {
  private swaggerPaths: Record<string, any> = {};
  private schemaProcessor: SchemaProcessor;
  private config: OpenApiConfig;
  private strategy: RouterStrategy;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processFileTracker: Record<string, boolean> = {};

  constructor(config: OpenApiConfig) {
    this.config = config;
    this.schemaProcessor = new SchemaProcessor(
      config.schemaDir,
      config.schemaType,
      config.schemaFiles
    );
    this.strategy = config.routerType === "pages"
      ? new PagesRouterStrategy(config)
      : new AppRouterStrategy(config);
  }

  private buildResponsesFromConfig(
    dataTypes: DataTypes,
    method: string
  ): Record<string, any> {
    const responses: Record<string, any> = {};

    // 1. Add success response
    const successCode =
      dataTypes.successCode || this.getDefaultSuccessCode(method);

    // Handle 204 No Content responses without a schema
    if (successCode === "204" && !dataTypes.responseType) {
      responses[successCode] = {
        description: dataTypes.responseDescription || "No Content",
      };
    } else if (dataTypes.responseType) {
      // 204 No Content should not have a content section per HTTP/OpenAPI spec
      if (successCode === "204") {
        responses[successCode] = {
          description: dataTypes.responseDescription || "No Content",
        };
      } else {
        // Handle array notation (e.g., "Type[]", "Type[][]", "Generic<T>[]")
        let schema: any;
        let baseType = dataTypes.responseType;
        let arrayDepth = 0;

        // Count and remove array brackets
        while (baseType.endsWith('[]')) {
          arrayDepth++;
          baseType = baseType.slice(0, -2);
        }

        // Ensure the base schema is defined in components/schemas
        this.schemaProcessor.getSchemaContent({
          responseType: baseType,
        });

        // Build schema reference
        if (arrayDepth === 0) {
          // Not an array
          schema = { $ref: `#/components/schemas/${baseType}` };
        } else {
          // Build nested array schema
          schema = { $ref: `#/components/schemas/${baseType}` };
          for (let i = 0; i < arrayDepth; i++) {
            schema = {
              type: "array",
              items: schema,
            };
          }
        }

        responses[successCode] = {
          description: dataTypes.responseDescription || "Successful response",
          content: {
            "application/json": {
              schema: schema,
            },
          },
        };
      }
    }

    // 2. Add responses from ResponseSet
    const responseSetName =
      dataTypes.responseSet || this.config.defaultResponseSet;
    if (responseSetName && responseSetName !== "none") {
      const responseSets = this.config.responseSets || {};

      const setNames = responseSetName.split(",").map((s) => s.trim());

      setNames.forEach((setName) => {
        const responseSet = responseSets[setName];
        if (responseSet) {
          responseSet.forEach((errorCode) => {
            // Use $ref for components/responses
            responses[errorCode] = {
              $ref: `#/components/responses/${errorCode}`,
            };
          });
        }
      });
    }

    // 3. Add custom responses (@add)
    if (dataTypes.addResponses) {
      const customResponses = dataTypes.addResponses
        .split(",")
        .map((s) => s.trim());

      customResponses.forEach((responseRef) => {
        const [code, ref] = responseRef.split(":");
        if (ref) {
          // Custom schema: "409:ConflictResponse"
          // 204 No Content should not have a content section per HTTP/OpenAPI spec
          if (code === "204") {
            responses[code] = {
              description:
                this.getDefaultErrorDescription(code) || "No Content",
            };
          } else {
            responses[code] = {
              description:
                this.getDefaultErrorDescription(code) || `HTTP ${code} response`,
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${ref}` },
                },
              },
            };
          }
        } else {
          // Only code: "409" - use $ref fro components/responses
          responses[code] = {
            $ref: `#/components/responses/${code}`,
          };
        }
      });
    }

    return responses;
  }

  private getDefaultSuccessCode(method: string): string {
    switch (method.toUpperCase()) {
      case "POST":
        return "201";
      case "DELETE":
        return "204";
      default:
        return "200";
    }
  }

  private getDefaultErrorDescription(code: string): string {
    const defaults = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
      500: "Internal Server Error",
    };
    return defaults[code] || `HTTP ${code}`;
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
    const ignorePatterns = this.config.ignoreRoutes || [];
    if (ignorePatterns.length === 0) {
      return false;
    }

    return ignorePatterns.some((pattern) => {
      // Support wildcards
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/\//g, "\\/");
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(routePath);
    });
  }

  /**
   * Register a discovered route after filtering
   */
  private registerRoute(method: string, filePath: string, dataTypes: DataTypes): void {
    const routePath = this.strategy.getRoutePath(filePath);

    if (this.shouldIgnoreRoute(routePath, dataTypes)) {
      logger.debug(`Ignoring route: ${routePath}`);
      return;
    }

    if (this.config.includeOpenApiRoutes && !dataTypes.isOpenApi) {
      return;
    }

    const pathParams = extractPathParameters(routePath);
    if (pathParams.length > 0 && !dataTypes.pathParamsType) {
      logger.debug(
        `Route ${routePath} contains path parameters ${pathParams.join(
          ", "
        )} but no @pathParams type is defined.`
      );
    }

    this.addRouteToPaths(method, filePath, dataTypes);
  }

  public scanApiRoutes(dir: string): void {
    logger.debug(`Scanning API routes in: ${dir}`);

    let files = this.directoryCache[dir];
    if (!files) {
      files = fs.readdirSync(dir);
      this.directoryCache[dir] = files;
    }

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      let stat = this.statCache[filePath];
      if (!stat) {
        stat = fs.statSync(filePath);
        this.statCache[filePath] = stat;
      }

      if (stat.isDirectory()) {
        this.scanApiRoutes(filePath);
      } else if (this.strategy.shouldProcessFile(file)) {
        if (!this.processFileTracker[filePath]) {
          this.strategy.processFile(filePath, (method, fp, dataTypes) => {
            this.registerRoute(method, fp, dataTypes);
          });
          this.processFileTracker[filePath] = true;
        }
      }
    });
  }

  private addRouteToPaths(
    varName: string,
    filePath: string,
    dataTypes: DataTypes
  ): void {
    const method = varName.toLowerCase();
    const routePath = this.strategy.getRoutePath(filePath);
    const rootPath = capitalize(routePath.split("/")[1]);
    const operationId = dataTypes.operationId || getOperationId(routePath, method);
    const {
      tag,
      summary,
      description,
      auth,
      isOpenApi,
      deprecated,
      bodyDescription,
      responseDescription,
    } = dataTypes;

    if (this.config.includeOpenApiRoutes && !isOpenApi) {
      // If flag is enabled and there is no @openapi tag, then skip path
      return;
    }

    if (!this.swaggerPaths[routePath]) {
      this.swaggerPaths[routePath] = {};
    }

    const { params, pathParams, body, responses } =
      this.schemaProcessor.getSchemaContent(dataTypes);

    const definition: RouteDefinition = {
      operationId: operationId,
      summary: summary,
      description: description,
      tags: [tag || rootPath],
      parameters: [],
    };

    if (deprecated) {
      definition.deprecated = true;
    }

    // Add auth
    if (auth) {
      const authItems = auth.split(",").map(item => item.trim());

      definition.security = authItems.map(authItem => ({
        [authItem]: [],
      }));
    }

    if (params) {
      definition.parameters =
        this.schemaProcessor.createRequestParamsSchema(params);
    }

    // Add path parameters
    const pathParamNames = extractPathParameters(routePath);
    if (pathParamNames.length > 0) {
      // If we have path parameters but no schema, create a default schema
      if (!pathParams) {
        const defaultPathParams =
          this.schemaProcessor.createDefaultPathParamsSchema(pathParamNames);
        definition.parameters.push(...defaultPathParams);
      } else {
        const moreParams = this.schemaProcessor.createRequestParamsSchema(
          pathParams,
          true
        );
        definition.parameters.push(...moreParams);
      }
    } else if (pathParams) {
      // If no path parameters in route but we have a schema, use it
      const moreParams = this.schemaProcessor.createRequestParamsSchema(
        pathParams,
        true
      );
      definition.parameters.push(...moreParams);
    }

    // Add request body
    if (MUTATION_HTTP_METHODS.includes(method.toUpperCase())) {
      if (dataTypes.bodyType) {
        // Ensure the schema is defined in components/schemas
        this.schemaProcessor.getSchemaContent({
          bodyType: dataTypes.bodyType,
        });

        // Use reference to the schema
        const contentType = this.schemaProcessor.detectContentType(
          dataTypes.bodyType || "",
          dataTypes.contentType
        );

        definition.requestBody = {
          content: {
            [contentType]: {
              schema: { $ref: `#/components/schemas/${dataTypes.bodyType}` },
            },
          },
        };

        if (bodyDescription) {
          definition.requestBody.description = bodyDescription;
        }
      } else if (body && Object.keys(body).length > 0) {
        // Fallback to inline schema for backward compatibility
        definition.requestBody = this.schemaProcessor.createRequestBodySchema(
          body,
          bodyDescription,
          dataTypes.contentType
        );
      }
    }

    // Add responses
    definition.responses = this.buildResponsesFromConfig(dataTypes, method);

    // If there are no responses from config, use the old logic
    if (Object.keys(definition.responses).length === 0) {
      definition.responses = responses
        ? this.schemaProcessor.createResponseSchema(
            responses,
            responseDescription
          )
        : {};
    }

    this.swaggerPaths[routePath][method] = definition;
  }

  private getSortedPaths(paths: Record<string, any>): Record<string, any> {
    function comparePaths(a, b) {
      const aMethods = this.swaggerPaths[a] || {};
      const bMethods = this.swaggerPaths[b] || {};

      // Extract tags for all methods in path a
      const aTags = Object.values(aMethods).flatMap(
        (method: any) => method.tags || []
      );
      // Extract tags for all methods in path b
      const bTags = Object.values(bMethods).flatMap(
        (method: any) => method.tags || []
      );

      // Let's user only the first tags
      const aPrimaryTag = aTags[0] || "";
      const bPrimaryTag = bTags[0] || "";

      // Sort alphabetically based on the first tag
      const tagComparison = aPrimaryTag.localeCompare(bPrimaryTag);
      if (tagComparison !== 0) {
        return tagComparison; // Return the result of tag comparison
      }

      // Compare lengths of the paths
      const aLength = a.split("/").length;
      const bLength = b.split("/").length;

      return aLength - bLength; // Shorter paths come before longer ones
    }

    return Object.keys(paths)
      .sort(comparePaths.bind(this))
      .reduce((sorted, key) => {
        sorted[key] = paths[key];

        return sorted;
      }, {});
  }

  public getSwaggerPaths(): Record<string, any> {
    const paths = this.getSortedPaths(this.swaggerPaths);

    return this.getSortedPaths(paths);
  }
}
