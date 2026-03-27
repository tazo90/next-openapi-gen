import fse from "fs-extra";
import ora from "ora";

import openapiTemplate from "../../init/openapi-template.js";
import { createDocsPage } from "../../init/create-docs-page.js";
import { installDependencies } from "../../init/install-dependencies.js";
import { extendOpenApiTemplate, getErrorMessage, getOutputPath } from "../../init/template.js";
import type { OpenApiTemplate } from "../../shared/types.js";

import type { InitOptions } from "../../init/types.js";

export async function init(options: InitOptions): Promise<void> {
  const { ui, output, schema } = options;
  const spinner = ora("Initializing project with OpenAPI template...\n");

  spinner.start();

  try {
    const outputPath = getOutputPath(output);
    const template = { ...openapiTemplate } as OpenApiTemplate;

    extendOpenApiTemplate(template, options);

    await fse.writeJson(outputPath, template, { spaces: 2 });
    spinner.succeed(`Created OpenAPI template in ${outputPath}`);

    const docsPagePath = await createDocsPage(
      template.docsUrl ?? "api-docs",
      ui ?? "scalar",
      template.outputFile ?? "openapi.json",
    );
    if (docsPagePath) {
      spinner.succeed(`Created ${docsPagePath} for ${ui ?? "scalar"}.`);
    }

    await installDependencies(ui ?? "scalar", schema ?? "zod", spinner);
  } catch (error) {
    spinner.fail(`Failed to initialize project: ${getErrorMessage(error)}`);
  }
}
