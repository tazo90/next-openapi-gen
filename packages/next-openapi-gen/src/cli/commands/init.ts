import fse from "fs-extra";
import ora from "ora";

import { DEFAULT_DOCS_URL, DEFAULT_INIT_SCHEMA_TYPE, DEFAULT_UI } from "../../config/defaults.js";
import { createOpenApiTemplate } from "../../init/openapi-template.js";
import { createDocsPage } from "../../init/create-docs-page.js";
import { installDependencies } from "../../init/install-dependencies.js";
import { extendOpenApiTemplate, getErrorMessage, getOutputPath } from "../../init/template.js";
import type { OpenApiTemplate } from "../../shared/types.js";

import type { InitOptions } from "../../init/types.js";
import type { UiType } from "../../init/types.js";

export async function init(options: InitOptions): Promise<void> {
  const { framework, output, schema } = options;
  const spinner = ora("Initializing project with OpenAPI template...\n");

  spinner.start();

  try {
    const outputPath = getOutputPath(output);
    const template = createOpenApiTemplate(framework) as OpenApiTemplate;

    extendOpenApiTemplate(template, options);

    await fse.writeJson(outputPath, template, { spaces: 2 });
    spinner.succeed(`Created OpenAPI template in ${outputPath}`);

    const docsPagePath = await createDocsPage({
      ...(framework ? { framework } : {}),
      docsUrl: template.docsUrl ?? DEFAULT_DOCS_URL,
      ui: template.ui ?? DEFAULT_UI,
      outputFile: template.outputFile ?? "openapi.json",
    });
    if (docsPagePath) {
      spinner.succeed(`Created ${docsPagePath} for ${template.ui ?? DEFAULT_UI}.`);
    }

    await installDependencies(
      (template.ui ?? DEFAULT_UI) as UiType,
      schema ?? DEFAULT_INIT_SCHEMA_TYPE,
      spinner,
    );
  } catch (error) {
    spinner.fail(`Failed to initialize project: ${getErrorMessage(error)}`);
  }
}
