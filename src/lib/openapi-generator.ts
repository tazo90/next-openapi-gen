import path from "path";
import fs from "fs";

import { RouteProcessor } from "./route-processor";
import { cleanSpec } from "./utils";
import { OpenApiConfig, OpenApiTemplate } from "../types";

export class OpenApiGenerator {
  private config: OpenApiConfig;
  private template: OpenApiTemplate;
  private routeProcessor: RouteProcessor;

  constructor() {
    const templatePath = path.resolve("./next.openapi.json");

    this.template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    this.config = this.getConfig();

    this.routeProcessor = new RouteProcessor(this.config);
  }

  public getConfig() {
    // @ts-ignore
    const {
      apiDir,
      schemaDir,
      docsUrl,
      ui,
      outputFile,
      includeOpenApiRoutes,
      schemaType = "typescript",
    } = this.config;

    return {
      apiDir,
      schemaDir,
      docsUrl,
      ui,
      outputFile,
      includeOpenApiRoutes,
      schemaType,
    };
  }

  public generate() {
    const { apiDir } = this.config;

    // Check if app router structure exists
    let appRouterApiDir = "";
    if (fs.existsSync(path.join(path.dirname(apiDir), "app", "api"))) {
      appRouterApiDir = path.join(path.dirname(apiDir), "app", "api");
      console.log(`Found app router API directory at ${appRouterApiDir}`);
    }

    // Scan pages router routes
    this.routeProcessor.scanApiRoutes(apiDir);

    // If app router directory exists, scan it as well
    if (appRouterApiDir) {
      this.routeProcessor.scanApiRoutes(appRouterApiDir);
    }

    this.template.paths = this.routeProcessor.getSwaggerPaths();

    // Add server URL for examples if not already defined
    if (!this.template.servers || this.template.servers.length === 0) {
      this.template.servers = [
        {
          url: this.template.basePath || "",
          description: "API server",
        },
      ];
    }

    // Ensure there's a components section if not already defined
    if (!this.template.components) {
      this.template.components = {};
    }

    // Add schemas section if not already defined
    if (!this.template.components.schemas) {
      this.template.components.schemas = {};
    }

    // Get defined schemas from the processor
    const definedSchemas = this.routeProcessor
      .getSchemaProcessor()
      .getDefinedSchemas();
    if (definedSchemas && Object.keys(definedSchemas).length > 0) {
      this.template.components.schemas = {
        ...this.template.components.schemas,
        ...definedSchemas,
      };
    }

    const openapiSpec = cleanSpec(this.template);

    return openapiSpec;
  }
}
