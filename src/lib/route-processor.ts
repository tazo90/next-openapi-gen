import * as t from "@babel/types";
import fs from "fs";
import path from "path";
import traverse from "@babel/traverse";

import { SchemaProcessor } from "./schema-processor.js";
import {
  capitalize,
  extractJSDocComments,
  parseTypeScriptFile,
  extractPathParameters,
  getOperationId,
} from "./utils.js";
import { DataTypes, OpenApiConfig, RouteDefinition } from "../types.js";
import { logger } from "./logger.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MUTATION_HTTP_METHODS = ["PATCH", "POST", "PUT"];

export class RouteProcessor {
  private swaggerPaths: Record<string, any> = {};
  private schemaProcessor: SchemaProcessor;
  private config: OpenApiConfig;

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processFileTracker: Record<string, boolean> = {};

  constructor(config: OpenApiConfig) {
    this.config = config;
    this.schemaProcessor = new SchemaProcessor(
      config.schemaDir,
      config.schemaType
    );
  }

  private buildResponsesFromConfig(
    dataTypes: DataTypes,
    method: string
  ): Record<string, any> {
    const responses: Record<string, any> = {};

    // 1. Add success response
    const successCode =
      dataTypes.successCode || this.getDefaultSuccessCode(method);
    if (dataTypes.responseType) {
      const responseSchema = this.schemaProcessor.getSchemaContent({
        responseType: dataTypes.responseType,
      }).responses;
      responses[successCode] = {
        description: dataTypes.responseDescription || "Successful response",
        content: {
          "application/json": {
            schema: responseSchema,
          },
        },
      };
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
          responses[code] = {
            description:
              this.getDefaultErrorDescription(code) || `HTTP ${code} response`,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${ref}` },
              },
            },
          };
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

  private isRoute(varName: string): boolean {
    return HTTP_METHODS.includes(varName);
  }

  private processFile(filePath: string): void {
    // Check if the file has already been processed
    if (this.processFileTracker[filePath]) return;

    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    traverse.default(ast, {
      ExportNamedDeclaration: (path) => {
        const declaration = path.node.declaration;

        if (
          t.isFunctionDeclaration(declaration) &&
          t.isIdentifier(declaration.id)
        ) {
          const dataTypes = extractJSDocComments(path);
          if (this.isRoute(declaration.id.name)) {
            // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
            if (
              !this.config.includeOpenApiRoutes ||
              (this.config.includeOpenApiRoutes && dataTypes.isOpenApi)
            ) {
              // Check for URL parameters in the route path
              const routePath = this.getRoutePath(filePath);
              const pathParams = extractPathParameters(routePath);

              // If we have path parameters but no pathParamsType defined, we should log a warning
              if (pathParams.length > 0 && !dataTypes.pathParamsType) {
                logger.debug(
                  `Route ${routePath} contains path parameters ${pathParams.join(
                    ", "
                  )} but no @pathParams type is defined.`
                );
              }

              this.addRouteToPaths(declaration.id.name, filePath, dataTypes);
            }
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (this.isRoute(decl.id.name)) {
                const dataTypes = extractJSDocComments(path);
                // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
                if (
                  !this.config.includeOpenApiRoutes ||
                  (this.config.includeOpenApiRoutes && dataTypes.isOpenApi)
                ) {
                  const routePath = this.getRoutePath(filePath);
                  const pathParams = extractPathParameters(routePath);

                  if (pathParams.length > 0 && !dataTypes.pathParamsType) {
                    logger.debug(
                      `Route ${routePath} contains path parameters ${pathParams.join(
                        ", "
                      )} but no @pathParams type is defined.`
                    );
                  }

                  this.addRouteToPaths(decl.id.name, filePath, dataTypes);
                }
              }
            }
          });
        }
      },
    });

    this.processFileTracker[filePath] = true;
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
        // @ts-ignore
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        if (file === "route.ts" || file === "route.tsx") {
          this.processFile(filePath);
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
    const routePath = this.getRoutePath(filePath);
    const rootPath = capitalize(routePath.split("/")[1]);
    const operationId = getOperationId(routePath, method);
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
      definition.security = [
        {
          [auth]: [],
        },
      ];
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
      definition.requestBody = this.schemaProcessor.createRequestBodySchema(
        body,
        bodyDescription,
        dataTypes.contentType
      );
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

  private getRoutePath(filePath: string): string {
    // First, check if it's an app router path
    if (filePath.includes("/app/api/")) {
      // Get the relative path from the api directory
      const apiDirPos = filePath.indexOf("/app/api/");
      let relativePath = filePath.substring(apiDirPos + "/app/api".length);

      // Remove the /route.ts or /route.tsx suffix
      relativePath = relativePath.replace(/\/route\.tsx?$/, "");

      // Convert directory separators to URL path format
      relativePath = relativePath.replaceAll("\\", "/");

      // Convert Next.js dynamic route syntax to OpenAPI parameter syntax
      relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");

      // Handle catch-all routes ([...param])
      relativePath = relativePath.replace(/\/\[\.\.\.(.*)\]/g, "/{$1}");

      return relativePath;
    }

    // For pages router or other formats
    const suffixPath = filePath.split("api")[1];
    return suffixPath
      .replace(/route\.tsx?$/, "")
      .replaceAll("\\", "/")
      .replace(/\/$/, "")
      .replace(/\/\[([^\]]+)\]/g, "/{$1}") // Replace [param] with {param}
      .replace(/\/\[\.\.\.(.*)\]/g, "/{$1}"); // Replace [...param] with {param}
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
