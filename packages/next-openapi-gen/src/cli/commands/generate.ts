import fs from "node:fs";
import path from "node:path";

import fse from "fs-extra";
import ora from "ora";

import { GENERATE_DEFAULTS } from "../constants.js";
import { OpenApiGenerator } from "../../generator/openapi-generator.js";

export type GenerateOptions = {
  template?: string;
};

export async function generate(options: GenerateOptions): Promise<void> {
  const template = options.template ?? GENERATE_DEFAULTS.template;
  const spinner = ora("Generating OpenAPI specification...\n").start();

  const generator = new OpenApiGenerator({ templatePath: template });
  const config = generator.getConfig();

  const apiDir = path.resolve(config.apiDir);
  await fse.ensureDir(apiDir);

  const outputDir = path.resolve(config.outputDir);
  await fse.ensureDir(outputDir);

  const apiDocs = generator.generate();
  const outputFile = path.join(outputDir, config.outputFile);

  fs.writeFileSync(outputFile, JSON.stringify(apiDocs, null, 2));

  spinner.succeed(`OpenAPI specification generated at ${outputFile}`);
}
