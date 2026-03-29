import { Command, Option } from "commander";

import {
  CLI_FRAMEWORK_CHOICES,
  CLI_DESCRIPTION,
  CLI_NAME,
  CLI_SCHEMA_CHOICES,
  GENERATE_CONFIG_OPTION_DESCRIPTION,
  GENERATE_COMMAND_DESCRIPTION,
  GENERATE_TEMPLATE_OPTION_DESCRIPTION,
  GENERATE_WATCH_OPTION_DESCRIPTION,
  getCliVersion,
  INIT_COMMAND_DESCRIPTION,
  INIT_DEFAULTS,
  INIT_DOCS_URL_OPTION_DESCRIPTION,
  INIT_FRAMEWORK_OPTION_DESCRIPTION,
  INIT_OUTPUT_OPTION_DESCRIPTION,
  INIT_SCHEMA_OPTION_DESCRIPTION,
  INIT_UI_OPTION_DESCRIPTION,
} from "./constants.js";
import { generate } from "./commands/generate.js";
import { init } from "./commands/init.js";
import { UI_TYPES_WITH_NONE } from "../init/ui-registry.js";

export function buildProgram() {
  const program = new Command();

  program.name(CLI_NAME).version(getCliVersion()).description(CLI_DESCRIPTION);

  program
    .command("init")
    .addOption(
      new Option("-f, --framework <name>", INIT_FRAMEWORK_OPTION_DESCRIPTION)
        .choices([...CLI_FRAMEWORK_CHOICES])
        .default(INIT_DEFAULTS.framework),
    )
    .addOption(
      new Option("-i, --ui <type>", INIT_UI_OPTION_DESCRIPTION)
        .choices([...UI_TYPES_WITH_NONE])
        .default(INIT_DEFAULTS.ui),
    )
    .option("-u, --docs-url <url>", INIT_DOCS_URL_OPTION_DESCRIPTION, INIT_DEFAULTS.docsUrl)
    .addOption(
      new Option("-s, --schema <schemaType>", INIT_SCHEMA_OPTION_DESCRIPTION)
        .choices([...CLI_SCHEMA_CHOICES])
        .default(INIT_DEFAULTS.schema),
    )
    .option("-o, --output <file>", INIT_OUTPUT_OPTION_DESCRIPTION, INIT_DEFAULTS.output)
    .description(INIT_COMMAND_DESCRIPTION)
    .action(init);

  program
    .command("generate")
    .description(GENERATE_COMMAND_DESCRIPTION)
    .option("-c, --config <file>", GENERATE_CONFIG_OPTION_DESCRIPTION)
    .option("-t, --template <file>", GENERATE_TEMPLATE_OPTION_DESCRIPTION)
    .option("-w, --watch", GENERATE_WATCH_OPTION_DESCRIPTION, false)
    .action(generate);

  return program;
}
