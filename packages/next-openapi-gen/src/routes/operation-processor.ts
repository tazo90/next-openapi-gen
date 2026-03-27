import type { FrameworkAdapter } from "../frameworks/types.js";
import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import { capitalize, extractPathParameters, getOperationId } from "../shared/utils.js";
import type { DataTypes, RouteDefinition } from "../shared/types.js";
import { ResponseProcessor } from "./response-processor.js";

export class OperationProcessor {
  constructor(
    private readonly adapter: FrameworkAdapter,
    private readonly schemaProcessor: SchemaProcessor,
    private readonly responseProcessor: ResponseProcessor,
  ) {}

  public processOperation(
    varName: string,
    filePath: string,
    dataTypes: DataTypes,
  ): { routePath: string; method: string; definition: RouteDefinition } {
    const method = varName.toLowerCase();
    const routePath = this.adapter.getRoutePath(filePath);
    const rootSegment = routePath.split("/")[1] || "";
    const rootPath = capitalize(rootSegment);
    const operationId = dataTypes.operationId || getOperationId(routePath, method);
    const { tag, summary, description, auth, deprecated, bodyDescription, responseDescription } =
      dataTypes;

    const { params, pathParams, body, responses } =
      this.schemaProcessor.getSchemaContent(dataTypes);
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
      definition.parameters = this.schemaProcessor.createRequestParamsSchema(params);
    }

    const pathParamNames = extractPathParameters(routePath);
    if (pathParamNames.length > 0) {
      if (!pathParams) {
        const defaultPathParams =
          this.schemaProcessor.createDefaultPathParamsSchema(pathParamNames);
        definition.parameters.push(...defaultPathParams);
      } else {
        const moreParams = this.schemaProcessor.createRequestParamsSchema(pathParams, true);
        definition.parameters.push(...moreParams);
      }
    } else if (pathParams) {
      const moreParams = this.schemaProcessor.createRequestParamsSchema(pathParams, true);
      definition.parameters.push(...moreParams);
    }

    if (this.responseProcessor.supportsRequestBody(method)) {
      if (dataTypes.bodyType) {
        this.schemaProcessor.getSchemaContent({
          bodyType: dataTypes.bodyType,
        });

        const contentType = this.schemaProcessor.detectContentType(
          dataTypes.bodyType || "",
          dataTypes.contentType,
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
        definition.requestBody = this.schemaProcessor.createRequestBodySchema(
          body,
          bodyDescription,
          dataTypes.contentType,
        );
      }
    }

    definition.responses = this.responseProcessor.processResponses(dataTypes, method);
    if (Object.keys(definition.responses).length === 0) {
      definition.responses = responses
        ? this.schemaProcessor.createResponseSchema(responses, responseDescription)
        : {};
    }

    return {
      routePath,
      method,
      definition,
    };
  }
}
