import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import type {
  DataTypes,
  OpenApiResponseDefinition,
  OpenApiSchemaLike,
  ResolvedOpenApiConfig,
} from "../shared/types.js";

const MUTATION_HTTP_METHODS = ["PATCH", "POST", "PUT"];

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
    const successCode = dataTypes.successCode || this.getDefaultSuccessCode(method);

    if (successCode === "204" && !dataTypes.responseType) {
      responses[successCode] = {
        description: dataTypes.responseDescription || "No Content",
      };
    } else if (dataTypes.responseType) {
      if (successCode === "204") {
        responses[successCode] = {
          description: dataTypes.responseDescription || "No Content",
        };
      } else {
        let schema: OpenApiSchemaLike;
        let baseType = dataTypes.responseType;
        let arrayDepth = 0;

        while (baseType.endsWith("[]")) {
          arrayDepth++;
          baseType = baseType.slice(0, -2);
        }

        this.schemaProcessor.getSchemaContent({
          responseType: baseType,
        });

        if (arrayDepth === 0) {
          schema = { $ref: `#/components/schemas/${baseType}` };
        } else {
          schema = { $ref: `#/components/schemas/${baseType}` };
          for (let i = 0; i < arrayDepth; i++) {
            schema = {
              type: "array",
              items: schema,
            };
          }
        }

        responses[successCode] = {
          description: dataTypes.responseDescription || "Successful response",
          content: {
            "application/json": {
              schema,
            },
          },
        };
      }
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
          this.schemaProcessor.getSchemaContent({ responseType: ref });

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
    const defaults: Record<string, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
      500: "Internal Server Error",
    };
    return defaults[code] || `HTTP ${code}`;
  }
}
