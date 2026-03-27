import { cleanSpec } from "../shared/utils.js";
import type { OpenApiDocument, OpenApiVersion } from "../shared/types.js";

export interface OpenApiVersionProcessor {
  readonly id: OpenApiVersion;
  readonly version: string;
  finalize(document: OpenApiDocument): OpenApiDocument;
}

class DefaultOpenApiVersionProcessor implements OpenApiVersionProcessor {
  constructor(
    public readonly id: OpenApiVersion,
    public readonly version: string,
  ) {}

  finalize(document: OpenApiDocument): OpenApiDocument {
    return cleanSpec({
      ...document,
      openapi: this.version,
    });
  }
}

const OPENAPI_VERSION_PROCESSORS: Record<OpenApiVersion, OpenApiVersionProcessor> = {
  "3.0": new DefaultOpenApiVersionProcessor("3.0", "3.0.0"),
  "3.1": new DefaultOpenApiVersionProcessor("3.1", "3.1.0"),
  "3.2": new DefaultOpenApiVersionProcessor("3.2", "3.2.0"),
  "4.0": new DefaultOpenApiVersionProcessor("4.0", "4.0.0"),
};

export function getOpenApiVersionProcessor(
  openapiVersion: OpenApiVersion,
): OpenApiVersionProcessor {
  return OPENAPI_VERSION_PROCESSORS[openapiVersion];
}
