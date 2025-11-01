#!/usr/bin/env node

import { Command, Option } from "commander";

import { init } from "./commands/init.js";
import { generate } from "./commands/generate.js";

const program = new Command();

program
  .name("next-openapi-gen")
  .version("0.6.7")
  .description(
    "Super fast and easy way to generate OpenAPI documentation for Next.js"
  );

program
  .command("init")
  .addOption(
    new Option("-i, --ui <type>", "Specify the UI type, e.g., scalar. Use \"none\" for no UI")
      .choices(["scalar", "swagger", "redoc", "stoplight", "rapidoc", "none"])
      .default("swagger")
  )
  .option("-u, --docs-url <url>", "Specify the docs URL", "api-docs")
  .addOption(
    new Option("-s, --schema <schemaType>", "Specify the schema tool")
      .choices(["zod", "typescript"])
      .default("zod")
  )
  .option("-o, --output <file>", "Specify the output path for the OpenAPI template.", "next.openapi.json")
  .description("Initialize a openapi specification")
  .action(init);

program
  .command("generate")
  .description("Generate a specification based on api routes")
  .option("-t, --template <file>", "Specify the OpenAPI template file", "next.openapi.json")
  .action(generate);

program.parse(process.argv);
