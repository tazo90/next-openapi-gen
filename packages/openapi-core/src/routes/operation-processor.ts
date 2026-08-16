import type { GenerationPerformanceProfile } from "../core/performance.js";
import { measurePerformance } from "../core/performance.js";
import type { DiagnosticsCollector } from "../diagnostics/collector.js";
import { createMultipartEncoding } from "../schema/typescript/helpers.js";
import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import type {
  DataTypes,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
} from "../shared/types.js";
import {
  applyParameterExamples,
  capitalize,
  deepMerge,
  DEFAULT_AUTH_PRESET_REPLACEMENTS,
  getOperationId,
  performAuthPresetReplacements,
  resolveAnnotationTypeName,
} from "../shared/utils.js";
import { createCookieParameters } from "./cookie-parameters.js";
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
      diagnostics?: DiagnosticsCollector | undefined;
      performanceProfile?: GenerationPerformanceProfile | undefined;
    } = {},
  ) {
    this.authPresets = {
      ...DEFAULT_AUTH_PRESET_REPLACEMENTS,
      ...options.authPresets,
    };
    this.performanceProfile = options.performanceProfile;
    this.diagnostics = options.diagnostics;
  }

  private readonly diagnostics: DiagnosticsCollector | undefined;

  public processOperation(
    varName: string,
    routePath: string,
    dataTypes: DataTypes,
    pathParamNames: string[] = [],
    filePath?: string,
  ): { routePath: string; method: string; definition: OpenApiOperation } {
    const method = (dataTypes.method || varName).toLowerCase();
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
    let paramsType = resolveAnnotationTypeName(
      dataTypes.paramsType,
      dataTypes.inferredQueryParamsType,
    );
    let pathParamsType = resolveAnnotationTypeName(
      dataTypes.pathParamsType,
      dataTypes.inferredPathParamsType,
    );
    const bodyType = resolveAnnotationTypeName(dataTypes.bodyType, dataTypes.inferredBodyType);
    if (!paramsType && dataTypes.inferredQueryParamNames?.length) {
      paramsType = this.findQueryParamsCandidate(rootPath);
    }
    if (!pathParamsType && pathParamNames.length > 0) {
      pathParamsType = this.findPathParamsObjectCandidate(rootPath, pathParamNames);
    }
    this.addInferenceDiagnostics(dataTypes, routePath);

    const { params, pathParams } =
      paramsType || pathParamsType
        ? measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
            this.schemaProcessor.getSchemaContent({
              paramsType,
              pathParamsType,
            }),
          )
        : { params: undefined, pathParams: undefined };

    const mergedTags = this.mergeTags(tag || rootPath, additionalTags);
    const finalDescription = this.appendDeprecationReason(
      description,
      deprecated,
      deprecationReason,
    );

    const definition: OpenApiOperation = {
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

    const parameters = definition.parameters ?? [];
    definition.parameters = parameters;

    if (dataTypes.inferredQueryParamNames?.length) {
      if (!paramsType) {
        this.diagnostics?.add({
          code: "missing-query-params-type",
          severity: "warning",
          message:
            "Query parameters were inferred from searchParams usage, but no @query type is defined.",
          filePath,
          routePath,
          metadata: {
            names: dataTypes.inferredQueryParamNames,
            suggestedFix:
              "Add @query <SchemaName> or validate URL search parameters with a Zod schema in the handler.",
          },
        });
      }

      const knownQueryParameterNames = new Set(
        parameters.filter(isNamedQueryParameter).map((parameter) => parameter.name),
      );

      dataTypes.inferredQueryParamNames.forEach((name) => {
        if (knownQueryParameterNames.has(name)) {
          return;
        }

        parameters.push({
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
      const resolvedPathParams =
        pathParams?.properties && Object.keys(pathParams.properties).length > 0
          ? pathParams
          : undefined;

      if (!resolvedPathParams) {
        const candidatePathParams = this.createPathParamsFromIndividualCandidates(pathParamNames);
        if (candidatePathParams) {
          const candidateParams = measurePerformance(
            this.performanceProfile,
            "createRequestParamsMs",
            () => this.schemaProcessor.createRequestParamsSchema(candidatePathParams, true),
          );
          parameters.push(...candidateParams);
        } else {
          this.addPathParamCandidateDiagnostics(pathParamNames, routePath, filePath);
          const defaultPathParams = measurePerformance(
            this.performanceProfile,
            "createRequestParamsMs",
            () => this.schemaProcessor.createDefaultPathParamsSchema(pathParamNames),
          );
          parameters.push(...defaultPathParams);
        }
      } else {
        const moreParams = measurePerformance(
          this.performanceProfile,
          "createRequestParamsMs",
          () => this.schemaProcessor.createRequestParamsSchema(resolvedPathParams, true),
        );
        parameters.push(...moreParams);
      }
    } else if (pathParams) {
      const moreParams = measurePerformance(this.performanceProfile, "createRequestParamsMs", () =>
        this.schemaProcessor.createRequestParamsSchema(pathParams, true),
      );
      parameters.push(...moreParams);
    }

    if (dataTypes.querystringType) {
      measurePerformance(this.performanceProfile, "getSchemaContentMs", () => {
        this.schemaProcessor.ensureSchemaResolved(dataTypes.querystringType!, "params");
      });
    }

    const querystringParameter = this.createQuerystringParameter(dataTypes);
    if (querystringParameter) {
      parameters.push(querystringParameter);
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
      parameters.push(...headerParams);
    }

    if (dataTypes.cookieType) {
      parameters.push(
        ...createCookieParameters({
          dataTypes,
          schemaProcessor: this.schemaProcessor,
          performanceProfile: this.performanceProfile,
        }),
      );
    }

    applyParameterExamples(parameters, dataTypes.queryExamples, "query");
    applyParameterExamples(parameters, dataTypes.headerExamples, "header");
    applyParameterExamples(parameters, dataTypes.cookieExamples, "cookie");

    if (this.responseProcessor.supportsRequestBody(method)) {
      const requestBody = this.createRequestBody({ ...dataTypes, bodyType }, routePath);
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

  private findQueryParamsCandidate(rootPath: string): string | undefined {
    return this.findFirstSchemaCandidate([
      `${rootPath}QuerySchema`,
      `${rootPath}ParamsSchema`,
      `${rootPath}QueryParamsSchema`,
    ]);
  }

  private findPathParamsObjectCandidate(
    rootPath: string,
    pathParamNames: string[],
  ): string | undefined {
    const candidates = [
      `${rootPath}PathParamsSchema`,
      `${rootPath}ParamsSchema`,
      ...pathParamNames.map((name) => `${capitalize(name)}ParamsSchema`),
    ];
    return this.findFirstSchemaCandidate(candidates);
  }

  private createPathParamsFromIndividualCandidates(
    pathParamNames: string[],
  ):
    | { type: "object"; required: string[]; properties: Record<string, { $ref: string }> }
    | undefined {
    const properties: Record<string, { $ref: string }> = {};

    for (const name of pathParamNames) {
      const schemaName = this.findFirstSchemaCandidate([
        `${name}Schema`,
        `${capitalize(name)}Schema`,
      ]);
      if (!schemaName) {
        return undefined;
      }

      properties[name] = {
        $ref: `#/components/schemas/${this.schemaProcessor.getSchemaReferenceName(
          schemaName,
          "pathParams",
        )}`,
      };
    }

    return {
      type: "object",
      required: pathParamNames,
      properties,
    };
  }

  private addPathParamCandidateDiagnostics(
    pathParamNames: string[],
    routePath: string,
    filePath: string | undefined,
  ): void {
    pathParamNames.forEach((name) => {
      const schemaName = this.findFirstSchemaCandidate([
        `${name}Schema`,
        `${capitalize(name)}Schema`,
      ]);
      if (!schemaName) {
        return;
      }

      this.diagnostics?.add({
        code: "path-param-schema-conflict",
        severity: "info",
        message: `Path parameter "${name}" is using fallback schema inference even though "${schemaName}" exists. Add @path or validate context.params with that schema to preserve constraints.`,
        filePath,
        routePath,
        metadata: {
          parameterName: name,
          schemaName,
          suggestedFix: `Add @path ${schemaName}Params or validate context.params with a schema that includes "${name}".`,
        },
      });
    });
  }

  private findFirstSchemaCandidate(candidateNames: string[]): string | undefined {
    const hasSchemaCandidate =
      "hasSchemaCandidate" in this.schemaProcessor
        ? this.schemaProcessor.hasSchemaCandidate.bind(this.schemaProcessor)
        : undefined;
    if (!hasSchemaCandidate) {
      return undefined;
    }

    return candidateNames.find((candidateName) => hasSchemaCandidate(candidateName));
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

  private buildCallbacks(
    callbacks: NonNullable<DataTypes["callbacks"]>,
  ): NonNullable<OpenApiOperation["callbacks"]> {
    const output: NonNullable<OpenApiOperation["callbacks"]> = {};
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
    definition: OpenApiOperation,
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
    definition: OpenApiOperation,
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

  private addInferenceDiagnostics(dataTypes: DataTypes, routePath: string): void {
    if (
      !resolveAnnotationTypeName(dataTypes.pathParamsType) &&
      dataTypes.inferredPathParamsType?.trim()
    ) {
      this.diagnostics?.add({
        code: "inferred-path-params",
        severity: "info",
        message: `Inferred path parameter schema from handler validation: ${dataTypes.inferredPathParamsType}`,
        routePath,
        metadata: { schemaName: dataTypes.inferredPathParamsType },
      });
    }

    if (
      !resolveAnnotationTypeName(dataTypes.paramsType) &&
      dataTypes.inferredQueryParamsType?.trim()
    ) {
      this.diagnostics?.add({
        code: "inferred-query-params",
        severity: "info",
        message: `Inferred query parameter schema from handler validation: ${dataTypes.inferredQueryParamsType}`,
        routePath,
        metadata: { schemaName: dataTypes.inferredQueryParamsType },
      });
    }

    if (!resolveAnnotationTypeName(dataTypes.bodyType) && dataTypes.inferredBodyType?.trim()) {
      this.diagnostics?.add({
        code: "inferred-body",
        severity: "info",
        message: `Inferred request body schema from handler validation: ${dataTypes.inferredBodyType}`,
        routePath,
        metadata: { schemaName: dataTypes.inferredBodyType },
      });
    }
  }

  private applyPreset(scheme: string): string {
    return this.authPresets[scheme.toLowerCase()] ?? scheme;
  }

  private createRequestBody(
    dataTypes: DataTypes,
    routePath: string,
  ): OpenApiRequestBody | undefined {
    if (dataTypes.bodyType) {
      return this.createSchemaBackedRequestBody(dataTypes);
    }

    if (dataTypes.contentType?.toLowerCase() === "multipart/form-data") {
      this.diagnostics?.add({
        code: "multipart-missing-body-schema",
        severity: "warning",
        message:
          "Route declares @requestContentType multipart/form-data without @requestBody; using the default file-only multipart request body.",
        routePath,
      });
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

    if (dataTypes.requestItemType && dataTypes.requestItemType !== bodyType) {
      measurePerformance(this.performanceProfile, "getSchemaContentMs", () => {
        this.schemaProcessor.ensureSchemaResolved(dataTypes.requestItemType!, "body");
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
          ...(dataTypes.requestItemType
            ? {
                itemSchema: {
                  $ref: `#/components/schemas/${this.schemaProcessor.getSchemaReferenceName(
                    dataTypes.requestItemType,
                    "body",
                  )}`,
                },
              }
            : {}),
          ...(dataTypes.requestItemEncoding
            ? { itemEncoding: structuredClone(dataTypes.requestItemEncoding) }
            : {}),
          ...(dataTypes.requestPrefixEncoding
            ? { prefixEncoding: structuredClone(dataTypes.requestPrefixEncoding) }
            : {}),
        },
      },
    };

    if (dataTypes.bodyDescription) {
      requestBody.description = dataTypes.bodyDescription;
    }

    if (dataTypes.requestBodyRequired) {
      requestBody.required = true;
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
                type: "string",
                contentMediaType: "application/octet-stream",
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

  private createQuerystringParameter(dataTypes: DataTypes): OpenApiParameter | undefined {
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

function isNamedQueryParameter(
  parameter: NonNullable<OpenApiOperation["parameters"]>[number],
): parameter is OpenApiParameter {
  return "in" in parameter && parameter.in === "query" && typeof parameter.name === "string";
}
