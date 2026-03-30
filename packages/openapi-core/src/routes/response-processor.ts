import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import type {
  DataTypes,
  InferredResponseDefinition,
  OpenApiMediaTypeDefinition,
  OpenApiResponseDefinition,
  OpenApiSchemaLike,
  ResolvedOpenApiConfig,
} from "../shared/types.js";

const MUTATION_HTTP_METHODS = ["PATCH", "POST", "PUT"];
const DEFAULT_ERROR_DESCRIPTIONS: Record<string, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

export class ResponseProcessor {
  constructor(
    private readonly config: ResolvedOpenApiConfig,
    private readonly schemaProcessor: SchemaProcessor,
  ) {}

  public processResponses(
    dataTypes: DataTypes,
    method: string,
  ): Record<string, OpenApiResponseDefinition> {
    const responses: Record<string, OpenApiResponseDefinition> = {};
    const inferredPrimarySuccessCode = this.getPrimaryInferredSuccessCode(
      dataTypes.inferredResponses,
    );
    const successCode =
      dataTypes.successCode ||
      inferredPrimarySuccessCode ||
      (dataTypes.responseType || dataTypes.responseItemType
        ? "200"
        : this.getDefaultSuccessCode(method));

    const hasExplicitPrimaryResponse =
      Boolean(dataTypes.responseType) ||
      Boolean(dataTypes.responseItemType) ||
      Boolean(dataTypes.successCode);

    if (hasExplicitPrimaryResponse) {
      const explicitResponse = this.createTypedResponse(
        {
          statusCode: successCode,
          typeName: dataTypes.responseType,
          itemTypeName: dataTypes.responseItemType,
          description: dataTypes.responseDescription,
          contentType: dataTypes.responseContentType,
          source: "typescript",
        },
        dataTypes,
        method,
      );

      if (explicitResponse) {
        responses[successCode] = explicitResponse;
      }
    }

    if (
      (!hasExplicitPrimaryResponse || dataTypes.inferredResponses?.length) &&
      dataTypes.inferredResponses
    ) {
      dataTypes.inferredResponses.forEach((inferredResponse) => {
        const inferredCode = inferredResponse.statusCode || successCode;
        if (responses[inferredCode]) {
          return;
        }

        const response = this.createTypedResponse(inferredResponse, dataTypes, method);
        if (response) {
          responses[inferredCode] = response;
        }
      });
    }

    const responseSetName = dataTypes.responseSet || this.config.defaultResponseSet;
    if (responseSetName && responseSetName !== "none") {
      const responseSets = this.config.responseSets || {};
      const setNames = responseSetName.split(",").map((item) => item.trim());

      setNames.forEach((setName) => {
        const responseSet = responseSets[setName];
        if (responseSet) {
          responseSet.forEach((errorCode) => {
            responses[errorCode] = {
              $ref: `#/components/responses/${errorCode}`,
            };
          });
        }
      });
    }

    if (dataTypes.addResponses) {
      const customResponses = dataTypes.addResponses.split(",").map((item) => item.trim());

      customResponses.forEach((responseRef) => {
        const [code, ref, ...descriptionParts] = responseRef.split(":");
        if (!code) {
          return;
        }

        const customDescription = descriptionParts.join(":").trim();

        if (ref) {
          this.ensureSchemaResolved(ref);

          if (code === "204") {
            responses[code] = {
              description:
                customDescription || this.getDefaultErrorDescription(code) || "No Content",
            };
          } else {
            responses[code] = {
              description:
                customDescription ||
                this.getDefaultErrorDescription(code) ||
                `HTTP ${code} response`,
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${ref}` },
                },
              },
            };
          }
        } else {
          responses[code] = {
            $ref: `#/components/responses/${code}`,
          };
        }
      });
    }

    if (
      Object.keys(responses).length === 0 &&
      !hasExplicitPrimaryResponse &&
      (!dataTypes.inferredResponses || dataTypes.inferredResponses.length === 0) &&
      this.getDefaultSuccessCode(method) === "204"
    ) {
      responses["204"] = {
        description: "No Content",
      };
    }

    return responses;
  }

  public supportsRequestBody(method: string): boolean {
    return MUTATION_HTTP_METHODS.includes(method.toUpperCase());
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
    return DEFAULT_ERROR_DESCRIPTIONS[code] || `HTTP ${code}`;
  }

  private createTypedResponse(
    response: InferredResponseDefinition,
    dataTypes: DataTypes,
    method: string,
  ): OpenApiResponseDefinition | undefined {
    const statusCode =
      response.statusCode || dataTypes.successCode || this.getDefaultSuccessCode(method);
    const description =
      response.description ||
      dataTypes.responseDescription ||
      (statusCode === "204" ? "No Content" : "Successful response");

    if (
      statusCode === "204" ||
      (!response.typeName &&
        !response.schema &&
        !response.itemTypeName &&
        !dataTypes.responseItemType)
    ) {
      return {
        description,
      };
    }

    const mediaType = this.createResponseMediaType(response, dataTypes);
    return {
      description,
      content: {
        [response.contentType || dataTypes.responseContentType || "application/json"]: mediaType,
      },
    };
  }

  private createResponseMediaType(
    response: InferredResponseDefinition,
    dataTypes: DataTypes,
  ): OpenApiMediaTypeDefinition {
    const typeName = response.typeName || dataTypes.responseType;
    const itemTypeName = response.itemTypeName || dataTypes.responseItemType;
    const mediaType: OpenApiMediaTypeDefinition = {};

    if (itemTypeName) {
      mediaType.itemSchema = this.buildSchemaReference(itemTypeName);
      if (dataTypes.responseItemEncoding) {
        mediaType.itemEncoding = structuredClone(dataTypes.responseItemEncoding);
      }
      if (dataTypes.responsePrefixEncoding) {
        mediaType.prefixEncoding = structuredClone(dataTypes.responsePrefixEncoding);
      }
    } else if (response.schema) {
      mediaType.schema = structuredClone(response.schema);
    } else if (typeName) {
      mediaType.schema = this.buildSchemaReference(typeName);
    }

    if (dataTypes.responseExamples) {
      mediaType.examples = structuredClone(dataTypes.responseExamples);
    }

    return mediaType;
  }

  private getPrimaryInferredSuccessCode(
    inferredResponses: InferredResponseDefinition[] | undefined,
  ): string | undefined {
    const primarySuccessResponse = inferredResponses?.find((response) => {
      const statusCode = response.statusCode;
      return !statusCode || (Number(statusCode) >= 200 && Number(statusCode) < 300);
    });

    return primarySuccessResponse ? primarySuccessResponse.statusCode || "200" : undefined;
  }

  private buildSchemaReference(typeName: string): OpenApiSchemaLike {
    let baseType = typeName;
    let arrayDepth = 0;

    while (baseType.endsWith("[]")) {
      arrayDepth++;
      baseType = baseType.slice(0, -2);
    }

    let schema = this.resolveSchemaLike(baseType);
    for (let index = 0; index < arrayDepth; index++) {
      schema = {
        type: "array",
        items: schema,
      };
    }

    return schema;
  }

  private resolveSchemaLike(typeName: string): OpenApiSchemaLike {
    if (
      typeName === "string" ||
      typeName === "number" ||
      typeName === "boolean" ||
      typeName === "null"
    ) {
      return { type: typeName };
    }

    if (typeName.trim().startsWith("{") || typeName.trim().startsWith("[")) {
      return this.schemaProcessor.resolveTypeExpression(typeName);
    }

    this.ensureSchemaResolved(typeName);

    return { $ref: `#/components/schemas/${typeName}` };
  }

  private ensureSchemaResolved(typeName: string): void {
    this.schemaProcessor.ensureSchemaResolved(typeName, "response");
  }
}
