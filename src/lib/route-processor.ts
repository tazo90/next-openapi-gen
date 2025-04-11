import * as t from "@babel/types";
import fs from "fs";
import path from "path";
import traverse from "@babel/traverse";
import { parse } from "@babel/parser";

import { SchemaProcessor } from "./schema-processor.js";
import { capitalize, extractJSDocComments, getOperationId } from "./utils.js";
import { DataTypes, OpenApiConfig, RouteDefinition } from "../types.js";

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
    this.schemaProcessor = new SchemaProcessor(config.schemaDir);
  }

  private isRoute(varName: string) {
    return HTTP_METHODS.includes(varName);
  }

  private processFile(filePath: string) {
    // Check if the file has already been processed
    if (this.processFileTracker[filePath]) return;
  
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "decorators-legacy"],
    });

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
            if (!this.config.includeOpenApiRoutes || (this.config.includeOpenApiRoutes && dataTypes.isOpenApi))
              this.addRouteToPaths(declaration.id.name, filePath, dataTypes);
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (this.isRoute(decl.id.name)) {
                const dataTypes = extractJSDocComments(path);
                // Don't bother adding routes for processing if only including OpenAPI routes and the route is not OpenAPI
                if (!this.config.includeOpenApiRoutes || (this.config.includeOpenApiRoutes && dataTypes.isOpenApi))
                  this.addRouteToPaths(
                    decl.id.name,
                    filePath,
                    dataTypes
                  );
              }
            }
          });
        }
      },
    });

    this.processFileTracker[filePath] = true;
  }

  public scanApiRoutes(dir: string) {
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
      } else if (file.endsWith(".ts")) {
        this.processFile(filePath);
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
    const { summary, description, auth, isOpenApi } = dataTypes;

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
      tags: [rootPath],
    };

    // Add auth
    if (auth) {
      definition.security = [
        {
          [auth]: [],
        },
      ];
    }

    definition.parameters = [];
    if (params) {
      definition.parameters =
        this.schemaProcessor.createRequestParamsSchema(params);
    }
    if (pathParams) {
      const moreParams = this.schemaProcessor.createRequestParamsSchema(pathParams, true);
      definition.parameters.push(...moreParams);
    }

    // Add request body
    if (MUTATION_HTTP_METHODS.includes(method.toUpperCase())) {
      definition.requestBody =
        this.schemaProcessor.createRequestBodySchema(body);
    }

    // Add responses
    definition.responses = responses
      ? this.schemaProcessor.createResponseSchema(responses)
      : {};

    this.swaggerPaths[routePath][method] = definition;
  }

  private getRoutePath(filePath: string): string {
    const suffixPath = filePath.split("api")[1];
    return suffixPath
      .replace("route.ts", "")
      .replaceAll("\\", "/")
      .replace(/\/$/, "")
      // Turns NextJS-style dynamic routes into OpenAPI-style dynamic routes
      .replaceAll("[", "{")
      .replaceAll("]", "}");
  }

  private getSortedPaths(paths: Record<string, any>) {
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

  public getSwaggerPaths() {
    const paths = this.getSortedPaths(this.swaggerPaths);

    return this.getSortedPaths(paths);
  }
}
