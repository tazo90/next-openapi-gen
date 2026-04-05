import type { GenerationPerformanceProfile } from "../core/performance.js";
import { measurePerformance } from "../core/performance.js";
import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import { createMultipartEncoding } from "../schema/typescript/helpers.js";
import { capitalize, getOperationId } from "../shared/utils.js";
import type { DataTypes, ParamSchema, RouteDefinition } from "../shared/types.js";
import { ResponseProcessor } from "./response-processor.js";

export class OperationProcessor {
  constructor(
    private readonly schemaProcessor: SchemaProcessor,
    private readonly responseProcessor: ResponseProcessor,
    private readonly performanceProfile?: GenerationPerformanceProfile,
  ) {}

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
    const { tag, summary, description, auth, deprecated, bodyDescription, responseDescription } =
      dataTypes;

    const { params, pathParams } =
      dataTypes.paramsType || dataTypes.pathParamsType
        ? measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
            this.schemaProcessor.getSchemaContent({
              paramsType: dataTypes.paramsType,
              pathParamsType: dataTypes.pathParamsType,
            }),
          )
        : { params: undefined, pathParams: undefined };
    const definition: RouteDefinition = {
      operationId,
      summary,
      description,
      tags: [tag || rootPath],
      parameters: [],
    };

    if (deprecated) {
      definition.deprecated = true;
    }

    if (auth) {
      const authItems = auth.split(",").map((item) => item.trim());
      definition.security = authItems.map((authItem) => ({
        [authItem]: [],
      }));
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

    if (this.responseProcessor.supportsRequestBody(method)) {
      if (dataTypes.bodyType) {
        const contentType = this.schemaProcessor.detectContentType(
          dataTypes.bodyType || "",
          dataTypes.contentType,
        );
        const multipartEncoding =
          contentType === "multipart/form-data"
            ? measurePerformance(this.performanceProfile, "getSchemaContentMs", () =>
                createMultipartEncoding(
                  this.schemaProcessor.getSchemaContent({
                    bodyType: dataTypes.bodyType,
                  }).body,
                ),
              )
            : undefined;

        if (!multipartEncoding) {
          measurePerformance(this.performanceProfile, "getSchemaContentMs", () => {
            this.schemaProcessor.ensureSchemaResolved(dataTypes.bodyType!, "body");
          });
        }

        definition.requestBody = {
          content: {
            [contentType]: {
              schema: {
                $ref: `#/components/schemas/${this.schemaProcessor.getSchemaReferenceName(
                  dataTypes.bodyType,
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

        if (bodyDescription) {
          definition.requestBody.description = bodyDescription;
        }
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

    return {
      routePath,
      method,
      definition,
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
