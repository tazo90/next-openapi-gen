import path from "node:path";

import { DEFAULT_GENERATE_TEMPLATE_PATH } from "@workspace/openapi-core/config/defaults.js";
export { getErrorMessage } from "@workspace/openapi-core/shared/error.js";
import type { OpenApiTemplate } from "@workspace/openapi-core/shared/types.js";

import type { InitOptions } from "./types.js";

export function extendOpenApiTemplate(spec: OpenApiTemplate, options: InitOptions): void {
  spec.ui = options.ui ?? spec.ui;
  spec.docsUrl = options.docsUrl ?? spec.docsUrl;
  spec.schemaType = options.schema ?? spec.schemaType;
}

export function getOutputPath(output?: string) {
  if (output) {
    return path.isAbsolute(output) ? output : path.join(process.cwd(), output);
  }

  return path.join(process.cwd(), DEFAULT_GENERATE_TEMPLATE_PATH);
}
