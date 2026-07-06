import { Command, Option } from "commander";

import {
  CLI_DESCRIPTION,
  CLI_FRAMEWORK_CHOICES,
  CLI_SCHEMA_CHOICES,
  CLI_UI_CHOICES,
  GENERATE_COMMAND_DESCRIPTION,
  GENERATE_CONFIG_OPTION_DESCRIPTION,
  GENERATE_FAIL_ON_OPTION_DESCRIPTION,
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
  resolveCliName,
} from "./constants.js";

export function buildProgram(options: { argv?: string[] } = {}) {
  const program = new Command();

  program.name(resolveCliName(options.argv)).version(getCliVersion()).description(CLI_DESCRIPTION);

  program
    .command("init")
    .addOption(
      new Option("-f, --framework <name>", INIT_FRAMEWORK_OPTION_DESCRIPTION)
        .choices([...CLI_FRAMEWORK_CHOICES])
        .default(INIT_DEFAULTS.framework),
    )
    .addOption(
      new Option("-i, --ui <type>", INIT_UI_OPTION_DESCRIPTION)
        .choices([...CLI_UI_CHOICES])
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
    .action(async (options) => {
      const { init } = await import("./commands/init.js");
      return await init(options);
    });

  program
    .command("generate")
    .description(GENERATE_COMMAND_DESCRIPTION)
    .option("-c, --config <file>", GENERATE_CONFIG_OPTION_DESCRIPTION)
    .option("-t, --template <file>", GENERATE_TEMPLATE_OPTION_DESCRIPTION)
    .option("-w, --watch", GENERATE_WATCH_OPTION_DESCRIPTION, false)
    .addOption(
      new Option("--fail-on <severity>", GENERATE_FAIL_ON_OPTION_DESCRIPTION).choices([
        "error",
        "warning",
        "never",
      ]),
    )
    .action(async (options) => {
      const { generate } = await import("./commands/generate.js");
      return await generate(options);
    });

  return program;
}
