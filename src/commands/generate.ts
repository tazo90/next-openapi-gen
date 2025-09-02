import fs from "fs";
import fse from "fs-extra";
import path from "path";
import ora from "ora";

import { OpenApiGenerator } from "../lib/openapi-generator.js";

export async function generate() {
  const spinner = ora("Generating OpenAPI specification...\n").start();

  const generator = new OpenApiGenerator();
  const config = generator.getConfig();

  // Create api dir if not exists
  const apiDir = path.resolve(config.apiDir);
  await fse.ensureDir(apiDir);

  // Use user-defined output directory
  const outputDir = path.resolve(config.outputDir);
  await fse.ensureDir(outputDir);

  const apiDocs = generator.generate();

  // Write api docs
  const outputFile = path.join(outputDir, config.outputFile);
  fs.writeFileSync(outputFile, JSON.stringify(apiDocs, null, 2));

  spinner.succeed(`OpenAPI specification generated at ${outputFile}`);
}
