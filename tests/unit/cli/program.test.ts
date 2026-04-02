import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

import {
  CLI_FRAMEWORK_CHOICES,
  CLI_NAME,
  CLI_SCHEMA_CHOICES,
  GENERATE_CONFIG_OPTION_DESCRIPTION,
  getCliVersion,
  GENERATE_COMMAND_DESCRIPTION,
  GENERATE_WATCH_OPTION_DESCRIPTION,
  INIT_COMMAND_DESCRIPTION,
  INIT_DEFAULTS,
  INIT_FRAMEWORK_OPTION_DESCRIPTION,
  buildProgram,
} from "@workspace/openapi-cli";
import { UI_TYPES_WITH_NONE } from "@workspace/openapi-init/init/ui-registry.js";

describe("CLI program", () => {
  it("registers the init and generate commands with the expected defaults", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());
    const initCommand = program.commands.find((command) => command.name() === "init");
    const generateCommand = program.commands.find((command) => command.name() === "generate");

    expect(commandNames).toEqual(["init", "generate"]);
    expect(initCommand?.opts()).toEqual({
      ui: "scalar",
      framework: "next",
      docsUrl: "api-docs",
      schema: "zod",
      output: "next.openapi.json",
    });
    expect(generateCommand?.opts()).toEqual({
      config: undefined,
      template: undefined,
      watch: false,
    });
  });

  it("exposes stable command descriptions, aliases, and choices", () => {
    const program = buildProgram();
    const initCommand = program.commands.find((command) => command.name() === "init");
    const generateCommand = program.commands.find((command) => command.name() === "generate");
    const initOptions = initCommand?.options ?? [];
    const generateOptions = generateCommand?.options ?? [];
    const frameworkOption = initOptions.find((option) => option.attributeName() === "framework");
    const uiOption = initOptions.find((option) => option.attributeName() === "ui");
    const schemaOption = initOptions.find((option) => option.attributeName() === "schema");
    const docsUrlOption = initOptions.find((option) => option.attributeName() === "docsUrl");
    const outputOption = initOptions.find((option) => option.attributeName() === "output");
    const configOption = generateOptions.find((option) => option.attributeName() === "config");
    const templateOption = generateOptions.find((option) => option.attributeName() === "template");
    const watchOption = generateOptions.find((option) => option.attributeName() === "watch");

    expect(initCommand?.description()).toBe(INIT_COMMAND_DESCRIPTION);
    expect(generateCommand?.description()).toBe(GENERATE_COMMAND_DESCRIPTION);
    expect(frameworkOption?.flags).toBe("-f, --framework <name>");
    expect(frameworkOption?.argChoices).toEqual([...CLI_FRAMEWORK_CHOICES]);
    expect(frameworkOption?.defaultValue).toBe(INIT_DEFAULTS.framework);
    expect(uiOption?.flags).toBe("-i, --ui <type>");
    expect(uiOption?.argChoices).toEqual([...UI_TYPES_WITH_NONE]);
    expect(uiOption?.defaultValue).toBe(INIT_DEFAULTS.ui);
    expect(schemaOption?.flags).toBe("-s, --schema <schemaType>");
    expect(schemaOption?.argChoices).toEqual([...CLI_SCHEMA_CHOICES]);
    expect(schemaOption?.defaultValue).toBe(INIT_DEFAULTS.schema);
    expect(docsUrlOption?.flags).toBe("-u, --docs-url <url>");
    expect(docsUrlOption?.defaultValue).toBe(INIT_DEFAULTS.docsUrl);
    expect(outputOption?.flags).toBe("-o, --output <file>");
    expect(outputOption?.defaultValue).toBe(INIT_DEFAULTS.output);
    expect(configOption?.flags).toBe("-c, --config <file>");
    expect(templateOption?.flags).toBe("-t, --template <file>");
    expect(templateOption?.defaultValue).toBeUndefined();
    expect(watchOption?.flags).toBe("-w, --watch");
  });

  it("parses init and generate options through the public command surface", async () => {
    const program = buildProgram();
    const actionSpy = vi.fn<MockFn>();
    program.commands.forEach((command) => {
      command.action(actionSpy);
    });

    await program.parseAsync(["init", "-i", "none"], {
      from: "user",
    });
    await program.parseAsync(
      [
        "init",
        "--framework",
        "react-router",
        "--ui",
        "rapidoc",
        "--docs-url",
        "internal/docs",
        "--schema",
        "typescript",
        "--output",
        "config/spec.json",
      ],
      { from: "user" },
    );
    await program.parseAsync(
      [
        "generate",
        "--config",
        "next-openapi.config.ts",
        "--template",
        "config/spec.json",
        "--watch",
      ],
      { from: "user" },
    );

    await expect(
      program.parseAsync(["init", "--ui", "unknown-ui"], {
        from: "user",
      }),
    ).rejects.toThrow('process.exit unexpectedly called with "1"');

    expect(actionSpy).toHaveBeenNthCalledWith(
      1,
      {
        docsUrl: INIT_DEFAULTS.docsUrl,
        framework: INIT_DEFAULTS.framework,
        output: INIT_DEFAULTS.output,
        schema: INIT_DEFAULTS.schema,
        ui: "none",
      },
      expect.anything(),
    );
    expect(actionSpy).toHaveBeenNthCalledWith(
      2,
      {
        docsUrl: "internal/docs",
        framework: "react-router",
        output: "config/spec.json",
        schema: "typescript",
        ui: "rapidoc",
      },
      expect.anything(),
    );
    expect(actionSpy).toHaveBeenNthCalledWith(
      3,
      {
        config: "next-openapi.config.ts",
        template: "config/spec.json",
        watch: true,
      },
      expect.anything(),
    );
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
    expect(helpText).toContain("generate [options]");
    expect(helpText).toContain(INIT_COMMAND_DESCRIPTION);
    expect(helpText).toContain(GENERATE_COMMAND_DESCRIPTION);
    expect(initHelpText).toContain("--docs-url <url>");
    expect(initHelpText).toContain("--framework <name>");
    expect(initHelpText).toContain("--schema <schemaType>");
    expect(initHelpText).toContain("--output <file>");
    expect(initHelpText).toContain(INIT_FRAMEWORK_OPTION_DESCRIPTION);
    expect(generateHelpText).toContain("--template <file>");
    expect(generateHelpText).toContain("--config <file>");
    expect(generateHelpText).toContain("--watch");
    expect(generateHelpText).toContain(GENERATE_CONFIG_OPTION_DESCRIPTION);
    expect(generateHelpText).toContain(GENERATE_WATCH_OPTION_DESCRIPTION);
  });
});
