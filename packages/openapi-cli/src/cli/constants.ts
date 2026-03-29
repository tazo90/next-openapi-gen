import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_DOCS_URL,
  DEFAULT_GENERATE_TEMPLATE_PATH,
  DEFAULT_INIT_SCHEMA_TYPE,
  DEFAULT_UI,
  SCHEMA_TYPES,
} from "@workspace/openapi-core/config/defaults.js";
import { INIT_FRAMEWORKS } from "@workspace/openapi-init";

export const CLI_NAME = "openapi-gen";
export const LEGACY_CLI_NAME = "next-openapi-gen";
export const CLI_DESCRIPTION =
  "Super fast and easy way to generate OpenAPI documentation for framework route handlers";
export const INIT_COMMAND_DESCRIPTION = "Initialize an OpenAPI specification";
export const GENERATE_COMMAND_DESCRIPTION = "Generate a specification based on API routes";
export const GENERATE_CONFIG_OPTION_DESCRIPTION = "Specify the config file";
export const INIT_FRAMEWORK_OPTION_DESCRIPTION = "Specify the target framework";
export const INIT_UI_OPTION_DESCRIPTION = 'Specify the UI type, e.g., scalar. Use "none" for no UI';
export const INIT_DOCS_URL_OPTION_DESCRIPTION = "Specify the docs URL";
export const INIT_SCHEMA_OPTION_DESCRIPTION = "Specify the schema tool";
export const INIT_OUTPUT_OPTION_DESCRIPTION = "Specify the output path for the OpenAPI template.";
export const GENERATE_TEMPLATE_OPTION_DESCRIPTION = "Specify the OpenAPI template file";
export const GENERATE_WATCH_OPTION_DESCRIPTION =
  "Watch route and schema files and regenerate on changes";

export const INIT_DEFAULTS = {
  docsUrl: DEFAULT_DOCS_URL,
  framework: INIT_FRAMEWORKS[0],
  output: DEFAULT_GENERATE_TEMPLATE_PATH,
  schema: DEFAULT_INIT_SCHEMA_TYPE,
  ui: DEFAULT_UI,
} as const;

export const GENERATE_DEFAULTS = {
  template: DEFAULT_GENERATE_TEMPLATE_PATH,
} as const;

export const CLI_FRAMEWORK_CHOICES = [...INIT_FRAMEWORKS] as const;
export const CLI_SCHEMA_CHOICES = [...SCHEMA_TYPES] as const;

type PackageJson = {
  version?: string;
};

export function getCliVersion(): string {
  const packageJsonPath = PACKAGE_JSON_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!packageJsonPath) {
    return "0.0.0";
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;

  return packageJson.version ?? "0.0.0";
}

export function resolveCliName(argv: string[] = process.argv): string {
  const executablePath = argv[1];
  if (!executablePath) {
    return CLI_NAME;
  }

  return path.parse(executablePath).name === LEGACY_CLI_NAME ? LEGACY_CLI_NAME : CLI_NAME;
}

const PACKAGE_JSON_CANDIDATES = [
  new URL("../package.json", import.meta.url),
  new URL("../../package.json", import.meta.url),
] as const;
