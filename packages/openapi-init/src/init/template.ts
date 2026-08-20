import path from "node:path";

import { DEFAULT_GENERATE_TEMPLATE_PATH } from "@workspace/openapi-core/config/defaults.js";
export { getErrorMessage } from "@workspace/openapi-core/shared/error.js";
import type { OpenApiTemplate } from "@workspace/openapi-core/shared/types.js";

import type { InitOptions } from "./types.js";

const IDENTIFIER_KEY = /^(\s*)"([A-Za-z_$][\w$]*)":/gm;

export function extendOpenApiTemplate(spec: OpenApiTemplate, options: InitOptions): void {
  spec.ui = options.ui ?? spec.ui;
  spec.docsUrl = options.docsUrl ?? spec.docsUrl;
  spec.schemaType = options.schema ?? spec.schemaType;
}

export function getOutputPath(output?: string): string {
  if (output) {
    return path.isAbsolute(output) ? output : path.join(process.cwd(), output);
  }

  return path.join(process.cwd(), DEFAULT_GENERATE_TEMPLATE_PATH);
}

export function isJsonConfigPath(outputPath: string): boolean {
  return path.extname(outputPath) === ".json";
}

export function serializeOpenApiTemplate(template: OpenApiTemplate, outputPath: string): string {
  const json = `${JSON.stringify(template, null, 2)}\n`;
  if (isJsonConfigPath(outputPath)) {
    return json;
  }

  const objectLiteral = json.trimEnd().replace(IDENTIFIER_KEY, "$1$2:");
  return `import { defineConfig } from "next-openapi-gen";\n\nexport default defineConfig(${objectLiteral});\n`;
}
