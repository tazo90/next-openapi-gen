import ora from "ora";

import { generateProject, watchProject } from "@workspace/openapi-core";

import { createDefaultGenerationAdapters } from "../../default-adapters.js";

export type GenerateOptions = {
  config?: string;
  template?: string;
  watch?: boolean;
};

export async function generate(options: GenerateOptions): Promise<void> {
  const configPath = options.config ?? options.template;
  const spinner = ora("Generating OpenAPI specification...\n").start();
  const adapters = createDefaultGenerationAdapters();
  const result = await generateProject({
    adapters,
    configPath,
  });

  spinner.succeed(`OpenAPI specification generated at ${result.outputFile}`);

  if (options.watch) {
    spinner.info("Watching for route and schema changes...");
    await watchProject({
      adapters,
      configPath,
    });
  }
}
