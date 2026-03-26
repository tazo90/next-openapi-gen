import path from "node:path";

import type { OpenApiTemplate } from "../shared/types.js";

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

  return path.join(process.cwd(), "next.openapi.json");
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
