import type { GenerationAdapters } from "@workspace/openapi-core/core/adapters.js";
import { generateProject } from "@workspace/openapi-core/core/generate.js";

import { createExpressFrameworkSource } from "../frameworks/express/source.js";

export type ExpressOpenApiOptions = {
  configPath?: string | undefined;
};

export function createExpressGenerationAdapters(): GenerationAdapters {
  return {
    createFrameworkSource: createExpressFrameworkSource,
  };
}

export async function generateExpressOpenApi(options: ExpressOpenApiOptions = {}): Promise<void> {
  await generateProject({
    adapters: createExpressGenerationAdapters(),
    configPath: options.configPath,
  });
}
