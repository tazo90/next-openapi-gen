import { describe, expect, it } from "vitest";

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
});
