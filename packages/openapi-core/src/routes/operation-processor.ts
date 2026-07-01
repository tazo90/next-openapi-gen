import type { GenerationPerformanceProfile } from "../core/performance.js";
import { measurePerformance } from "../core/performance.js";
import { createMultipartEncoding } from "../schema/typescript/helpers.js";
import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import type {
  DataTypes,
  OpenApiRequestBody,
  ParamSchema,
  RouteDefinition,
} from "../shared/types.js";
import {
  capitalize,
  deepMerge,
  DEFAULT_AUTH_PRESET_REPLACEMENTS,
  getOperationId,
  performAuthPresetReplacements,
} from "../shared/utils.js";
import type { ResponseProcessor } from "./response-processor.js";

const DEFAULT_MULTIPART_REQUEST_BODY_DESCRIPTION = "Multipart form data containing a file upload.";

export class OperationProcessor {
  private readonly authPresets: Record<string, string>;
  private readonly performanceProfile: GenerationPerformanceProfile | undefined;

  constructor(
    private readonly schemaProcessor: SchemaProcessor,
    private readonly responseProcessor: ResponseProcessor,
    options: {
      authPresets?: Record<string, string> | undefined;
      performanceProfile?: GenerationPerformanceProfile | undefined;
    } = {},
  ) {
    this.authPresets = {
      ...DEFAULT_AUTH_PRESET_REPLACEMENTS,
      ...options.authPresets,
    };
    this.performanceProfile = options.performanceProfile;
  }

  public processOperation(
    varName: string,
    routePath: string,
    dataTypes: DataTypes,
    pathParamNames: string[] = [],
  ): { routePath: string; method: string; definition: RouteDefinition } {
    const method = varName.toLowerCase();
    const rootSegment = routePath.split("/")[1] || "";
    const rootPath = capitalize(rootSegment);
    const operationId = dataTypes.operationId || getOperationId(routePath, method);
    const {
      tag,
      tags: additionalTags,
      summary,
      description,
      auth,
      security: explicitSecurity,
      servers,
      externalDocs,
      callbacks,
      responseHeaders,
      responseLinks,
      deprecated,
      deprecationReason,
      responseDescription,
      openapiOverride,
    } = dataTypes;

    const { params, pathParams } =
      dataTypes.paramsType || dataTypes.pathParamsType
        ? measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
            this.schemaProcessor.getSchemaContent({
              paramsType: dataTypes.paramsType,
              pathParamsType: dataTypes.pathParamsType,
            }),
          )
        : { params: undefined, pathParams: undefined };

    const mergedTags = this.mergeTags(tag || rootPath, additionalTags);
    const finalDescription = this.appendDeprecationReason(
      description,
      deprecated,
      deprecationReason,
    );

    const definition: RouteDefinition = {
      operationId,
      summary,
      description: finalDescription,
      tags: mergedTags,
      parameters: [],
    };

    if (deprecated) {
      definition.deprecated = true;
    }

    if (explicitSecurity && explicitSecurity.length > 0) {
      definition.security = explicitSecurity.map((req) =>
        Object.fromEntries(
          Object.entries(req).map(([scheme, scopes]) => [this.applyPreset(scheme), scopes]),
        ),
      );
    } else if (auth) {
      const mapped = performAuthPresetReplacements(auth, this.authPresets);
      const authItems = mapped.split(",").map((item) => item.trim());
      definition.security = authItems.map((authItem) => ({
        [authItem]: [],
      }));
    }

    if (servers && servers.length > 0) {
      definition.servers = servers;
    }

    if (externalDocs) {
      definition.externalDocs = externalDocs.description
        ? { url: externalDocs.url, description: externalDocs.description }
        : { url: externalDocs.url };
    }

    if (callbacks && callbacks.length > 0) {
      definition.callbacks = this.buildCallbacks(callbacks);
    }

    if (params) {
      definition.parameters = measurePerformance(
        this.performanceProfile,
        "createRequestParamsMs",
        () => this.schemaProcessor.createRequestParamsSchema(params),
      );
    }

    if (dataTypes.inferredQueryParamNames?.length) {
      const knownQueryParameterNames = new Set(
        definition.parameters
          .filter((parameter) => parameter.in === "query")
          .map((parameter) => parameter.name),
      );

      dataTypes.inferredQueryParamNames.forEach((name) => {
        if (knownQueryParameterNames.has(name)) {
          return;
        }

        definition.parameters.push({
          in: "query",
          name,
          required: false,
          schema: {
            type: "string",
          },
          example: this.schemaProcessor.getExampleForParam(name, "string"),
        });
      });
    }

    if (pathParamNames.length > 0) {
      if (!pathParams) {
        const defaultPathParams = measurePerformance(
          this.performanceProfile,
          "createRequestParamsMs",
          () => this.schemaProcessor.createDefaultPathParamsSchema(pathParamNames),
        );
        definition.parameters.push(...defaultPathParams);
      } else {
        const moreParams = measurePerformance(
          this.performanceProfile,
          "createRequestParamsMs",
          () => this.schemaProcessor.createRequestParamsSchema(pathParams, true),
        );
        definition.parameters.push(...moreParams);
      }
    } else if (pathParams) {
      const moreParams = measurePerformance(this.performanceProfile, "createRequestParamsMs", () =>
        this.schemaProcessor.createRequestParamsSchema(pathParams, true),
      );
      definition.parameters.push(...moreParams);
    }

    if (dataTypes.querystringType) {
      measurePerformance(this.performanceProfile, "getSchemaContentMs", () => {
        this.schemaProcessor.ensureSchemaResolved(dataTypes.querystringType!, "params");
      });
    }

    const querystringParameter = this.createQuerystringParameter(dataTypes);
    if (querystringParameter) {
      definition.parameters.push(querystringParameter);
    }

    if (dataTypes.headerType) {
      const headerContent = measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
        this.schemaProcessor.getSchemaContent({
          paramsType: dataTypes.headerType,
        }),
      );
      const headerParams = measurePerformance(
        this.performanceProfile,
        "createRequestParamsMs",
        () => this.schemaProcessor.createRequestParamsSchema(headerContent.params, false, "header"),
      );
      definition.parameters.push(...headerParams);
    }

    if (dataTypes.cookieType) {
      const cookieContent = measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
        this.schemaProcessor.getSchemaContent({
          paramsType: dataTypes.cookieType,
        }),
      );
      const cookieParams = measurePerformance(
        this.performanceProfile,
        "createRequestParamsMs",
        () => this.schemaProcessor.createRequestParamsSchema(cookieContent.params, false, "cookie"),
      );
      definition.parameters.push(...cookieParams);
    }

    if (this.responseProcessor.supportsRequestBody(method)) {
      const requestBody = this.createRequestBody(dataTypes);
      if (requestBody) {
        definition.requestBody = requestBody;
      }
    }

    definition.responses = measurePerformance(this.performanceProfile, "processResponsesMs", () =>
      this.responseProcessor.processResponses(dataTypes, method),
    );
    if (Object.keys(definition.responses).length === 0) {
      const responses = dataTypes.responseType
        ? measurePerformance(
            this.performanceProfile,
            "getSchemaContentMs",
            () =>
              this.schemaProcessor.getSchemaContent({
                responseType: dataTypes.responseType,
              }).responses,
          )
        : undefined;

      definition.responses =
        responses && Object.keys(responses).length > 0
          ? measurePerformance(this.performanceProfile, "createResponseSchemaMs", () =>
              this.schemaProcessor.createResponseSchema(responses, responseDescription),
            )
          : {};
    }

    this.applyResponseHeaders(definition, responseHeaders);
    this.applyResponseLinks(definition, responseLinks);

    if (openapiOverride) {
      deepMerge(definition, structuredClone(openapiOverride) as Record<string, unknown>);
    }

    return {
      routePath,
      method,
      definition,
    };
  }

  private mergeTags(primary: string, additional?: string[]): string[] {
    if (!additional || additional.length === 0) {
      return [primary];
    }
    const mergedTags = new Set<string>([primary]);
    additional.forEach((tagName) => {
      const trimmed = tagName.trim();
      if (trimmed) {
        mergedTags.add(trimmed);
      }
    });
    return [...mergedTags];
  }

  private appendDeprecationReason(
    description: string | undefined,
    deprecated: boolean | undefined,
    deprecationReason: string | undefined,
  ): string | undefined {
    if (!deprecated || !deprecationReason) {
      return description;
    }

    const suffix = `Deprecated: ${deprecationReason}`;
    if (!description) {
      return suffix;
    }

    if (description.includes(deprecationReason)) {
      return description;
    }

    return `${description}\n\n${suffix}`;
  }

  private buildCallbacks(callbacks: NonNullable<DataTypes["callbacks"]>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const callback of callbacks) {
      if (callback.reference) {
        output[callback.name] = {
          [callback.expression]: {
            $ref: `#/components/callbacks/${callback.reference}`,
          },
        };
      } else {
        output[callback.name] = {
          [callback.expression]: {},
        };
      }
    }
    return output;
  }

  private applyResponseHeaders(
    definition: RouteDefinition,
    responseHeaders?: DataTypes["responseHeaders"],
  ): void {
    if (!responseHeaders || responseHeaders.length === 0 || !definition.responses) {
      return;
    }
    for (const header of responseHeaders) {
      const responseEntry = definition.responses[header.status];
      if (!responseEntry || "$ref" in responseEntry) {
        continue;
      }
      const response = responseEntry as { headers?: Record<string, unknown> };
      response.headers ??= {};
      const headerObject: Record<string, unknown> = {};
      if (header.description) {
        headerObject.description = header.description;
      }
      if (header.schema) {
        headerObject.schema = structuredClone(header.schema);
      }
      response.headers[header.name] = headerObject;
    }
  }

  private applyResponseLinks(
    definition: RouteDefinition,
    responseLinks?: DataTypes["responseLinks"],
  ): void {
    if (!responseLinks || responseLinks.length === 0 || !definition.responses) {
      return;
    }
    for (const link of responseLinks) {
      const responseEntry = definition.responses[link.status];
      if (!responseEntry || "$ref" in responseEntry) {
        continue;
      }
      const response = responseEntry as { links?: Record<string, unknown> };
      response.links ??= {};
      const linkObject: Record<string, unknown> = {};
      if (link.operationId) {
        linkObject.operationId = link.operationId;
      }
      if (link.operationRef) {
        linkObject.operationRef = link.operationRef;
      }
      if (link.parameters) {
        linkObject.parameters = structuredClone(link.parameters);
      }
      if (link.requestBody) {
        linkObject.requestBody = structuredClone(link.requestBody);
      }
      if (link.description) {
        linkObject.description = link.description;
      }
      if (link.server) {
        linkObject.server = structuredClone(link.server);
      }
      response.links[link.name] = linkObject;
    }
  }

  private applyPreset(scheme: string): string {
    return this.authPresets[scheme.toLowerCase()] ?? scheme;
  }

  private createRequestBody(dataTypes: DataTypes): OpenApiRequestBody | undefined {
    if (dataTypes.bodyType) {
      return this.createSchemaBackedRequestBody(dataTypes);
    }

    if (dataTypes.contentType?.toLowerCase() === "multipart/form-data") {
      return this.createDefaultMultipartRequestBody(dataTypes.bodyDescription);
    }

    return undefined;
  }

  private createSchemaBackedRequestBody(dataTypes: DataTypes): OpenApiRequestBody {
    const bodyType = dataTypes.bodyType!;
    const contentType = this.schemaProcessor.detectContentType(bodyType, dataTypes.contentType);
    const multipartEncoding =
      contentType === "multipart/form-data"
        ? measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
            createMultipartEncoding(
              this.schemaProcessor.getSchemaContent({
                bodyType,
              }).body,
            ),
          )
        : undefined;

    if (!multipartEncoding) {
      measurePerformance(this.performanceProfile, "getSchemaContentMs", () => {
        this.schemaProcessor.ensureSchemaResolved(bodyType, "body");
      });
    }

    const requestBody: OpenApiRequestBody = {
      content: {
        [contentType]: {
          schema: {
            $ref: `#/components/schemas/${this.schemaProcessor.getSchemaReferenceName(
              bodyType,
              "body",
            )}`,
          },
          ...(dataTypes.requestExamples
            ? { examples: structuredClone(dataTypes.requestExamples) }
            : {}),
          ...(multipartEncoding ? { encoding: multipartEncoding } : {}),
        },
      },
    };

    if (dataTypes.bodyDescription) {
      requestBody.description = dataTypes.bodyDescription;
    }

    return requestBody;
  }

  private createDefaultMultipartRequestBody(description?: string): OpenApiRequestBody {
    const finalDescription = description || DEFAULT_MULTIPART_REQUEST_BODY_DESCRIPTION;

    return {
      content: {
        "multipart/form-data": {
          schema: {
            properties: {
              file: {
                format: "binary",
                type: "string",
              },
            },
            required: ["file"],
            type: "object",
          },
        },
      },
      description: finalDescription,
      required: true,
    };
  }

  private createQuerystringParameter(dataTypes: DataTypes): ParamSchema | undefined {
    if (!dataTypes.querystringType) {
      return undefined;
    }

    return {
      in: "querystring",
      name: dataTypes.querystringName || "query",
      required: false,
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            $ref: `#/components/schemas/${this.schemaProcessor.getSchemaReferenceName(
              dataTypes.querystringType,
              "params",
            )}`,
          },
          ...(dataTypes.querystringExamples
            ? { examples: structuredClone(dataTypes.querystringExamples) }
            : {}),
        },
      },
    };
  }
}
