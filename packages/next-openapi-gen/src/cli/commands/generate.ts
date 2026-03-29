import ora from "ora";

import { generateProject } from "../../core/generate.js";
import { watchProject } from "../../core/watch.js";

export type GenerateOptions = {
  config?: string;
  template?: string;
  watch?: boolean;
};

export async function generate(options: GenerateOptions): Promise<void> {
  const configPath = options.config ?? options.template;
  const spinner = ora("Generating OpenAPI specification...\n").start();
  const result = await generateProject({
    configPath,
  });

  spinner.succeed(`OpenAPI specification generated at ${result.outputFile}`);

  if (options.watch) {
    spinner.info("Watching for route and schema changes...");
    await watchProject({
      configPath,
    });
  }
}
