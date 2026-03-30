import fse from "fs-extra";
import ora from "ora";

import {
  DEFAULT_DOCS_URL,
  DEFAULT_INIT_SCHEMA_TYPE,
  DEFAULT_UI,
} from "@workspace/openapi-core/config/defaults.js";
import type { OpenApiTemplate } from "@workspace/openapi-core/shared/types.js";
import {
  createDocsPage,
  createOpenApiTemplate,
  extendOpenApiTemplate,
  getErrorMessage,
  getOutputPath,
  installDependencies,
  type InitOptions,
  type UiType,
} from "@workspace/openapi-init";

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
