import { buildProgram } from "./cli/program.js";

export { createDefaultGenerationAdapters } from "./default-adapters.js";
export { buildProgram } from "./cli/program.js";
export * from "./cli/constants.js";

export function runCli(argv: string[] = process.argv): void {
  buildProgram({ argv }).parse(argv);
}
