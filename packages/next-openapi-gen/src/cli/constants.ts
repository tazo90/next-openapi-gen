import fs from "node:fs";

import {
  DEFAULT_DOCS_URL,
  DEFAULT_GENERATE_TEMPLATE_PATH,
  DEFAULT_INIT_SCHEMA_TYPE,
  DEFAULT_UI,
  SCHEMA_TYPES,
} from "../config/defaults.js";

export const CLI_NAME = "next-openapi-gen";
export const CLI_DESCRIPTION =
  "Super fast and easy way to generate OpenAPI documentation for Next.js";
export const INIT_COMMAND_DESCRIPTION = "Initialize an OpenAPI specification";
export const GENERATE_COMMAND_DESCRIPTION = "Generate a specification based on API routes";
export const INIT_UI_OPTION_DESCRIPTION = 'Specify the UI type, e.g., scalar. Use "none" for no UI';
export const INIT_DOCS_URL_OPTION_DESCRIPTION = "Specify the docs URL";
export const INIT_SCHEMA_OPTION_DESCRIPTION = "Specify the schema tool";
export const INIT_OUTPUT_OPTION_DESCRIPTION = "Specify the output path for the OpenAPI template.";
export const GENERATE_TEMPLATE_OPTION_DESCRIPTION = "Specify the OpenAPI template file";

export const INIT_DEFAULTS = {
  docsUrl: DEFAULT_DOCS_URL,
  output: DEFAULT_GENERATE_TEMPLATE_PATH,
  schema: DEFAULT_INIT_SCHEMA_TYPE,
  ui: DEFAULT_UI,
} as const;

export const GENERATE_DEFAULTS = {
  template: DEFAULT_GENERATE_TEMPLATE_PATH,
} as const;

export const CLI_SCHEMA_CHOICES = [...SCHEMA_TYPES] as const;

type PackageJson = {
  version?: string;
};

export function getCliVersion(): string {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as PackageJson;

  return packageJson.version ?? "0.0.0";
}
