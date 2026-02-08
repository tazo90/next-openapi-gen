import * as t from "@babel/types";
import fs from "fs";
import path from "path";
import traverseModule from "@babel/traverse";

// Handle both ES modules and CommonJS
const traverse = (traverseModule as any).default || traverseModule;

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
      config.schemaType,
      config.schemaFiles
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

  private isRoute(varName: string): boolean {
    return HTTP_METHODS.includes(varName);
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

  private processFile(filePath: string): void {
    // Check if the file has already been processed
    if (this.processFileTracker[filePath]) return;

    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        const declaration = path.node.declaration;

        if (
          t.isFunctionDeclaration(declaration) &&
          t.isIdentifier(declaration.id)
        ) {
          const dataTypes = extractJSDocComments(path);
          if (this.isRoute(declaration.id.name)) {
            const routePath = this.getRoutePath(filePath);

            // Skip if route should be ignored
            if (this.shouldIgnoreRoute(routePath, dataTypes)) {
              logger.debug(`Ignoring route: ${routePath}`);
              return;
            }

            // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
            if (
              !this.config.includeOpenApiRoutes ||
              (this.config.includeOpenApiRoutes && dataTypes.isOpenApi)
            ) {
              // Check for URL parameters in the route path
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
                const routePath = this.getRoutePath(filePath);

                // Skip if route should be ignored
                if (this.shouldIgnoreRoute(routePath, dataTypes)) {
                  logger.debug(`Ignoring route: ${routePath}`);
                  return;
                }

                // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
                if (
                  !this.config.includeOpenApiRoutes ||
                  (this.config.includeOpenApiRoutes && dataTypes.isOpenApi)
                ) {
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

  /**
   * Process Pages Router API files
   * Pages Router uses export default function handler with @method tags
   */
  private processPagesRouterFile(filePath: string): void {
    // Check if the file has already been processed
    if (this.processFileTracker[filePath]) return;

    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    // Collect all JSDoc comments with @method tags
    const methodComments: { method: string; dataTypes: DataTypes }[] = [];

    traverse(ast, {
      ExportDefaultDeclaration: (nodePath) => {
        // Get all leading comments for the export default
        const allComments = ast.comments || [];
        const exportStart = nodePath.node.start || 0;

        // Find all block comments before this export that contain @method
        allComments.forEach((comment) => {
          if (
            comment.type === "CommentBlock" &&
            (comment.end || 0) < exportStart
          ) {
            const commentValue = comment.value;
            if (commentValue.includes("@method")) {
              // Parse this comment block
              const dataTypes = this.extractJSDocFromComment(commentValue);
              if (dataTypes.method && HTTP_METHODS.includes(dataTypes.method)) {
                methodComments.push({
                  method: dataTypes.method,
                  dataTypes,
                });
              }
            }
          }
        });

        // Process each method found
        methodComments.forEach(({ method, dataTypes }) => {
          const routePath = this.getPagesRoutePath(filePath);

          // Skip if route should be ignored
          if (this.shouldIgnoreRoute(routePath, dataTypes)) {
            logger.debug(`Ignoring route: ${routePath} [${method}]`);
            return;
          }

          // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
          if (
            !this.config.includeOpenApiRoutes ||
            (this.config.includeOpenApiRoutes && dataTypes.isOpenApi)
          ) {
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
        });
      },
    });

    this.processFileTracker[filePath] = true;
  }

  /**
   * Extract JSDoc data from a comment string (for Pages Router)
   */
  private extractJSDocFromComment(commentValue: string): DataTypes {
    const cleanedComment = commentValue.replace(/\*\s*/g, "").trim();

    let tag = "";
    let summary = "";
    let description = "";
    let paramsType = "";
    let pathParamsType = "";
    let bodyType = "";
    let auth = "";
    let isOpenApi = cleanedComment.includes("@openapi");
    let isIgnored = cleanedComment.includes("@ignore");
    let deprecated = cleanedComment.includes("@deprecated");
    let bodyDescription = "";
    let contentType = "";
    let responseType = "";
    let responseDescription = "";
    let responseSet = "";
    let addResponses = "";
    let successCode = "";
    let operationId = "";
    let method = "";

    // Extract @method
    const methodMatch = cleanedComment.match(/@method\s+(\S+)/);
    if (methodMatch) {
      method = methodMatch[1].trim().toUpperCase();
    }

    // Extract summary (first line that doesn't start with @)
    const firstLine = cleanedComment.split("\n")[0];
    if (!firstLine.trim().startsWith("@")) {
      summary = firstLine.trim();
    }

    // Extract @description
    const descMatch = cleanedComment.match(/@description\s+(.*)/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // Extract @tag
    const tagMatch = cleanedComment.match(/@tag\s+(.*)/);
    if (tagMatch) {
      tag = tagMatch[1].trim();
    }

    // Extract @params or @queryParams
    const paramsMatch =
      cleanedComment.match(/@queryParams\s+([\w<>,\s\[\]]+)/) ||
      cleanedComment.match(/@params\s+([\w<>,\s\[\]]+)/);
    if (paramsMatch) {
      paramsType = paramsMatch[1].trim();
    }

    // Extract @pathParams
    const pathParamsMatch = cleanedComment.match(
      /@pathParams\s+([\w<>,\s\[\]]+)/
    );
    if (pathParamsMatch) {
      pathParamsType = pathParamsMatch[1].trim();
    }

    // Extract @body
    const bodyMatch = cleanedComment.match(/@body\s+([\w<>,\s\[\]]+)/);
    if (bodyMatch) {
      bodyType = bodyMatch[1].trim();
    }

    // Extract @bodyDescription
    const bodyDescMatch = cleanedComment.match(/@bodyDescription\s+(.*)/);
    if (bodyDescMatch) {
      bodyDescription = bodyDescMatch[1].trim();
    }

    // Extract @contentType
    const contentTypeMatch = cleanedComment.match(/@contentType\s+(.*)/);
    if (contentTypeMatch) {
      contentType = contentTypeMatch[1].trim();
    }

    // Extract @response
    const responseMatch = cleanedComment.match(
      /@response\s+(?:(\d+):)?([^@\n\r]+)/
    );
    if (responseMatch) {
      const [, code, type] = responseMatch;
      const trimmedType = type?.trim();

      if (!code && trimmedType && /^\d{3}$/.test(trimmedType)) {
        successCode = trimmedType;
        responseType = undefined;
      } else {
        successCode = code || "";
        responseType = trimmedType;
      }
    }

    // Extract @responseDescription
    const respDescMatch = cleanedComment.match(/@responseDescription\s+(.*)/);
    if (respDescMatch) {
      responseDescription = respDescMatch[1].trim();
    }

    // Extract @responseSet
    const respSetMatch = cleanedComment.match(/@responseSet\s+(.*)/);
    if (respSetMatch) {
      responseSet = respSetMatch[1].trim();
    }

    // Extract @add
    const addMatch = cleanedComment.match(/@add\s+(.*)/);
    if (addMatch) {
      addResponses = addMatch[1].trim();
    }

    // Extract @operationId
    const opIdMatch = cleanedComment.match(/@operationId\s+(\S+)/);
    if (opIdMatch) {
      operationId = opIdMatch[1].trim();
    }

    // Extract @auth
    const authMatch = cleanedComment.match(/@auth\s+(.*)/);
    if (authMatch) {
      const authValue = authMatch[1].trim();
      switch (authValue) {
        case "bearer":
          auth = "BearerAuth";
          break;
        case "basic":
          auth = "BasicAuth";
          break;
        case "apikey":
          auth = "ApiKeyAuth";
          break;
      }
    }

    return {
      tag,
      auth,
      summary,
      description,
      paramsType,
      pathParamsType,
      bodyType,
      isOpenApi,
      isIgnored,
      deprecated,
      bodyDescription,
      contentType,
      responseType,
      responseDescription,
      responseSet,
      addResponses,
      successCode,
      operationId,
      method,
    };
  }

  /**
   * Get route path for Pages Router files
   */
  private getPagesRoutePath(filePath: string): string {
    // Normalize path separators first
    const normalizedPath = filePath.replaceAll("\\", "/");

    // Normalize apiDir to ensure consistent format
    const normalizedApiDir = this.config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    // Find the apiDir position in the normalized path
    const apiDirIndex = normalizedPath.indexOf(normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(
        `Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`
      );
    }

    // Extract the path after apiDir
    let relativePath = normalizedPath.substring(
      apiDirIndex + normalizedApiDir.length
    );

    // Remove the file extension (.ts or .tsx)
    relativePath = relativePath.replace(/\.tsx?$/, "");

    // Remove /index suffix (pages/api/users/index.ts -> /users)
    relativePath = relativePath.replace(/\/index$/, "");

    // Ensure the path starts with /
    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }

    // Remove trailing slash
    relativePath = relativePath.replace(/\/$/, "");

    // Handle catch-all routes ([...param]) before converting dynamic routes
    relativePath = relativePath.replace(/\/\[\.\.\.(.*?)\]/g, "/{$1}");

    // Convert Next.js dynamic route syntax to OpenAPI parameter syntax
    relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");

    return relativePath || "/";
  }

  public scanApiRoutes(dir: string): void {
    logger.debug(`Scanning API routes in: ${dir}`);

    let files = this.directoryCache[dir];
    if (!files) {
      files = fs.readdirSync(dir);
      this.directoryCache[dir] = files;
    }

    const isPagesRouter = this.config.routerType === "pages";

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
        if (isPagesRouter) {
          // Pages Router: process all .ts/.tsx files except _middleware, _app, _document
          if (!file.startsWith("_")) {
            this.processPagesRouterFile(filePath);
          }
        } else {
          // App Router: only process route.ts/route.tsx files
          if (file === "route.ts" || file === "route.tsx") {
            this.processFile(filePath);
          }
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
    const routePath =
      this.config.routerType === "pages"
        ? this.getPagesRoutePath(filePath)
        : this.getRoutePath(filePath);
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

  private getRoutePath(filePath: string): string {
    // Normalize path separators first
    const normalizedPath = filePath.replaceAll("\\", "/");

    // Normalize apiDir to ensure consistent format
    const normalizedApiDir = this.config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    // Find the apiDir position in the normalized path
    const apiDirIndex = normalizedPath.indexOf(normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(
        `Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`
      );
    }

    // Extract the path after apiDir
    let relativePath = normalizedPath.substring(
      apiDirIndex + normalizedApiDir.length
    );

    // Remove the /route.ts or /route.tsx suffix
    relativePath = relativePath.replace(/\/route\.tsx?$/, "");

    // Ensure the path starts with /
    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }

    // Remove trailing slash
    relativePath = relativePath.replace(/\/$/, "");

    // Remove Next.js route groups (folders in parentheses like (authenticated), (marketing))
    relativePath = relativePath.replace(/\/\([^)]+\)/g, "");

    // Handle catch-all routes ([...param]) before converting dynamic routes
    // This must come first because [...param] would also match the [param] pattern
    relativePath = relativePath.replace(/\/\[\.\.\.(.*?)\]/g, "/{$1}");

    // Convert Next.js dynamic route syntax to OpenAPI parameter syntax
    relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");

    return relativePath || "/";
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
