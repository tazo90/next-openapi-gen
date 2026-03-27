import path from "path";
import fs from "fs";

import { normalizeOpenApiConfig } from "../config/normalize.js";
import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { createDocumentFromTemplate } from "../openapi/document.js";
import { getOpenApiVersionProcessor } from "../openapi/version-processor.js";
import { RouteProcessor } from "../routes/route-processor.js";
import { logger } from "../shared/logger.js";
import type {
  ErrorDefinition,
  ErrorTemplateConfig,
  OpenApiDocument,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
} from "../shared/types.js";

export type OpenApiGeneratorOptions = {
  templatePath?: string;
};

export class OpenApiGenerator {
  private config: ResolvedOpenApiConfig;
  private template: OpenApiTemplate;
  private diagnostics = new DiagnosticsCollector();
  private routeProcessor: RouteProcessor;

  constructor(opts: OpenApiGeneratorOptions = {}) {
    const templatePath = opts.templatePath || path.resolve("./next.openapi.json");

    this.template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
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
    document.paths = this.routeProcessor.getSwaggerPaths();

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
      this.generateErrorResponsesFromConfig(document, errorConfig);
    } else if (this.config.errorDefinitions) {
      // Use manual definitions (existing logic - if exists)
      const responses = document.components.responses;
      Object.entries(this.config.errorDefinitions).forEach(([code, errorDef]) => {
        responses[code] = this.createErrorResponseComponent(code, errorDef);
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

  private generateErrorResponsesFromConfig(
    document: OpenApiDocument,
    errorConfig: ErrorTemplateConfig,
  ): void {
    const { template, codes, variables: globalVars = {} } = errorConfig;
    const responses = document.components?.responses;
    if (!responses) {
      return;
    }

    Object.entries(codes).forEach(([errorCode, config]) => {
      const httpStatus = (config.httpStatus || this.guessHttpStatus(errorCode)).toString();

      // Merge variables: global + per-code + built-in
      const allVariables = {
        ...globalVars,
        ...config.variables,
        ERROR_CODE: errorCode,
        DESCRIPTION: config.description,
        HTTP_STATUS: httpStatus,
      };

      const processedSchema = this.processTemplate(template, allVariables);

      responses[httpStatus] = {
        description: config.description,
        content: {
          "application/json": {
            schema: processedSchema,
          },
        },
      };
    });
  }

  private processTemplate(template: any, variables: Record<string, string>): any {
    const jsonStr = JSON.stringify(template);
    let result = jsonStr;

    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    return JSON.parse(result);
  }

  private guessHttpStatus(errorCode: string): number {
    const numericCode = parseInt(errorCode);
    if (numericCode >= 100 && numericCode < 600) {
      return numericCode;
    }

    const statusMap = {
      bad: 400,
      invalid: 400,
      validation: 422,
      unauthorized: 401,
      auth: 401,
      forbidden: 403,
      permission: 403,
      not_found: 404,
      missing: 404,
      conflict: 409,
      duplicate: 409,
      rate_limit: 429,
      too_many: 429,
      server: 500,
      internal: 500,
    };

    for (const [key, status] of Object.entries(statusMap)) {
      if (errorCode.toLowerCase().includes(key)) {
        return status;
      }
    }
    return 500;
  }

  private createErrorResponseComponent(code: string, errorDef: ErrorDefinition): any {
    return {
      description: errorDef.description,
      content: {
        "application/json": {
          schema: errorDef.schema,
        },
      },
    };
  }
}
