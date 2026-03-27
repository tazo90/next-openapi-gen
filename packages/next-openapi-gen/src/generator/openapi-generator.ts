import path from "path";
import fs from "fs";

import { DEFAULT_GENERATE_TEMPLATE_PATH } from "../config/defaults.js";
import { normalizeOpenApiConfig } from "../config/normalize.js";
import { DiagnosticsCollector } from "../diagnostics/collector.js";
import {
  createErrorResponseComponent,
  generateErrorResponsesFromConfig,
} from "./error-responses.js";
import { createDocumentFromTemplate } from "../openapi/document.js";
import { getOpenApiVersionProcessor } from "../openapi/version-processor.js";
import { RouteProcessor } from "../routes/route-processor.js";
import { getErrorMessage } from "../shared/error.js";
import { logger } from "../shared/logger.js";
import type { OpenApiDocument, OpenApiTemplate, ResolvedOpenApiConfig } from "../shared/types.js";

export type OpenApiGeneratorOptions = {
  templatePath?: string;
};

export class OpenApiGenerator {
  private config: ResolvedOpenApiConfig;
  private template: OpenApiTemplate;
  private diagnostics = new DiagnosticsCollector();
  private routeProcessor: RouteProcessor;

  constructor(opts: OpenApiGeneratorOptions = {}) {
    const templatePath = path.resolve(opts.templatePath ?? DEFAULT_GENERATE_TEMPLATE_PATH);

    this.template = readOpenApiTemplate(templatePath);
    this.config = this.getConfig();

    this.routeProcessor = new RouteProcessor(this.config, this.diagnostics);

    // Initialize logger
    logger.init(this.config);
  }

  public getConfig(): ResolvedOpenApiConfig {
    return normalizeOpenApiConfig(this.template);
  }

  public getDiagnostics() {
    return this.diagnostics.getAll();
  }

  public generate(): OpenApiDocument {
    logger.log("Starting OpenAPI generation...");

    const document = createDocumentFromTemplate(this.template);
    this.routeProcessor.scanRoutes();
    document.paths = this.routeProcessor.getPaths();

    // Add server URL for examples if not already defined
    if (!document.servers || document.servers.length === 0) {
      document.servers = [
        {
          url: document.basePath || "",
          description: "API server",
        },
      ];
    }

    // Ensure there's a components section if not already defined
    if (!document.components) {
      document.components = {};
    }

    // Add schemas section if not already defined
    if (!document.components.schemas) {
      document.components.schemas = {};
    }

    // Generate error responses using errorConfig or manual definitions
    if (!document.components.responses) {
      document.components.responses = {};
    }

    const errorConfig = this.config.errorConfig;
    if (errorConfig) {
      generateErrorResponsesFromConfig(document, errorConfig);
    } else if (this.config.errorDefinitions) {
      // Use manual definitions (existing logic - if exists)
      const responses = document.components.responses;
      Object.entries(this.config.errorDefinitions).forEach(([code, errorDef]) => {
        responses[code] = createErrorResponseComponent(errorDef);
      });
    }

    // Get defined schemas from the processor
    const definedSchemas = this.routeProcessor.getSchemaProcessor().getDefinedSchemas();
    if (definedSchemas && Object.keys(definedSchemas).length > 0) {
      document.components.schemas = {
        ...document.components.schemas,
        ...definedSchemas,
      };
    }

    const openapiSpec = getOpenApiVersionProcessor(this.config.openapiVersion).finalize(document);

    logger.log("OpenAPI generation completed");

    return openapiSpec;
  }
}

function readOpenApiTemplate(templatePath: string): OpenApiTemplate {
  try {
    return JSON.parse(fs.readFileSync(templatePath, "utf-8")) as OpenApiTemplate;
  } catch (error) {
    throw new Error(
      `Failed to read OpenAPI template at ${templatePath}: ${getErrorMessage(error)}`,
    );
  }
}
