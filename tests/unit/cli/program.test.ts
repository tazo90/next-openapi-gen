import { describe, expect, it } from "vitest";

import {
  CLI_NAME,
  getCliVersion,
  INIT_COMMAND_DESCRIPTION,
} from "@next-openapi-gen/cli/constants.js";
import { buildProgram } from "@next-openapi-gen/cli/program.js";

describe("CLI program", () => {
  it("registers the init and generate commands with the expected defaults", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());
    const initCommand = program.commands.find((command) => command.name() === "init");
    const generateCommand = program.commands.find((command) => command.name() === "generate");

    expect(commandNames).toEqual(["init", "generate"]);
    expect(initCommand?.opts()).toEqual({
      ui: "scalar",
      docsUrl: "api-docs",
      schema: "zod",
      output: "next.openapi.json",
    });
    expect(generateCommand?.opts()).toEqual({
      template: "next.openapi.json",
    });
  });

  it("uses package metadata for the CLI version and includes stable help output", () => {
    const program = buildProgram();
    const helpText = program.helpInformation();
    const initHelpText = program.commands
      .find((command) => command.name() === "init")
      ?.helpInformation();
    const generateHelpText = program.commands
      .find((command) => command.name() === "generate")
      ?.helpInformation();

    expect(program.name()).toBe(CLI_NAME);
    expect(program.version()).toBe(getCliVersion());
    expect(helpText).toContain("Commands:");
    expect(helpText).toContain("init [options]");
    expect(helpText).toContain(INIT_COMMAND_DESCRIPTION);
    expect(initHelpText).toContain("--docs-url <url>");
    expect(generateHelpText).toContain("--template <file>");
  });
});
