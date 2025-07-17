import path from "path";
import fs from "fs";

import { RouteProcessor } from "./route-processor.js";
import { cleanSpec } from "./utils.js";
import {
  ErrorDefinition,
  ErrorTemplateConfig,
  OpenApiConfig,
  OpenApiTemplate,
} from "../types.js";
import { logger } from "./logger.js";

export class OpenApiGenerator {
  private config: OpenApiConfig;
  private template: OpenApiTemplate;
  private routeProcessor: RouteProcessor;

  constructor() {
    const templatePath = path.resolve("./next.openapi.json");

    this.template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    this.config = this.getConfig();

    this.routeProcessor = new RouteProcessor(this.config);

    // Initialize logger
    logger.init(this.config);
  }

  public getConfig() {
    // @ts-ignore
    const { apiDir, schemaDir, docsUrl, ui, outputFile, includeOpenApiRoutes, schemaType = "typescript", defaultResponseSet, responseSets, errorConfig, debug } = this.template;

    return {
      apiDir,
      schemaDir,
      docsUrl,
      ui,
      outputFile,
      includeOpenApiRoutes,
      schemaType,
      defaultResponseSet,
      responseSets,
      errorConfig,
      debug,
    };
  }

  public generate() {
    logger.log("Starting OpenAPI generation...");

    const { apiDir } = this.config;

    // Check if app router structure exists
    let appRouterApiDir = "";
    if (fs.existsSync(path.join(path.dirname(apiDir), "app", "api"))) {
      appRouterApiDir = path.join(path.dirname(apiDir), "app", "api");
      logger.log(
        `Found app router API directory at ${appRouterApiDir}`
      );
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

    // Generate error responses using errorConfig or manual definitions
    if (!this.template.components.responses) {
      this.template.components.responses = {};
    }

    const errorConfig = this.config.errorConfig;
    if (errorConfig) {
      this.generateErrorResponsesFromConfig(errorConfig);
    } else if (this.config.errorDefinitions) {
      // Use manual definitions (existing logic - if exists)
      Object.entries(this.config.errorDefinitions).forEach(
        ([code, errorDef]) => {
          this.template.components.responses[code] =
            this.createErrorResponseComponent(code, errorDef);
        }
      );
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

    logger.log("OpenAPI generation completed");

    return openapiSpec;
  }

  private generateErrorResponsesFromConfig(
    errorConfig: ErrorTemplateConfig
  ): void {
    const { template, codes, variables: globalVars = {} } = errorConfig;

    Object.entries(codes).forEach(([errorCode, config]) => {
      const httpStatus = (
        config.httpStatus || this.guessHttpStatus(errorCode)
      ).toString();

      // Merge variables: global + per-code + built-in
      const allVariables = {
        ...globalVars,
        ...config.variables,
        ERROR_CODE: errorCode,
        DESCRIPTION: config.description,
        HTTP_STATUS: httpStatus,
      };

      const processedSchema = this.processTemplate(template, allVariables);

      this.template.components.responses[httpStatus] = {
        description: config.description,
        content: {
          "application/json": {
            schema: processedSchema,
          },
        },
      };
    });
  }

  private processTemplate(
    template: any,
    variables: Record<string, string>
  ): any {
    const jsonStr = JSON.stringify(template);
    let result = jsonStr;

    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    return JSON.parse(result);
  }

  private guessHttpStatus(errorCode: string): number {
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

  private createErrorResponseComponent(
    code: string,
    errorDef: ErrorDefinition
  ): any {
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
