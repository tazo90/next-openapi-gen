import ora from "ora";

import type { Diagnostic, DiagnosticFailOn } from "@workspace/openapi-core";
import { generateProject, watchProject } from "@workspace/openapi-core";

import { createDefaultGenerationAdapters } from "../../default-adapters.js";

export type GenerateOptions = {
  config?: string;
  failOn?: DiagnosticFailOn;
  template?: string;
  watch?: boolean;
};

export async function generate(options: GenerateOptions): Promise<void> {
  const configPath = options.config ?? options.template;
  const spinner = ora("Generating OpenAPI specification...\n").start();
  const adapters = createDefaultGenerationAdapters();
  if (options.watch) {
    spinner.info("Watching for route and schema changes...");
    await watchProject({
      adapters,
      configPath,
    });
    return;
  }

  const result = await generateProject({
    adapters,
    configPath,
  });

  spinner.succeed(`OpenAPI specification generated at ${result.outputFile}`);
  printDiagnostics(result.diagnostics ?? []);

  const failOn = options.failOn ?? result.diagnosticsFailOn;
  if (shouldFailOnDiagnostics(result.diagnostics, failOn)) {
    throw new Error(`OpenAPI generation failed because diagnostics matched --fail-on ${failOn}.`);
  }
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  if (diagnostics.length === 0) {
    return;
  }

  const grouped = {
    error: diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
    info: diagnostics.filter((diagnostic) => diagnostic.severity === "info"),
  };

  const lines = ["", "OpenAPI diagnostics:"];
  for (const severity of ["error", "warning", "info"] as const) {
    const items = grouped[severity];
    if (items.length === 0) {
      continue;
    }

    lines.push(`  ${severity}: ${items.length}`);
    for (const diagnostic of items) {
      const location = [diagnostic.filePath, diagnostic.routePath].filter(Boolean).join(" ");
      lines.push(
        `    - ${diagnostic.code}${location ? ` (${location})` : ""}: ${diagnostic.message}`,
      );
    }
  }

  process.stderr.write(`${lines.join("\n")}\n`);
}

function shouldFailOnDiagnostics(
  diagnostics: Diagnostic[],
  failOn: DiagnosticFailOn | undefined,
): boolean {
  switch (failOn) {
    case "error":
      return diagnostics.some((diagnostic) => diagnostic.severity === "error");
    case "warning":
      return diagnostics.some(
        (diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning",
      );
    case "never":
    case undefined:
      return false;
    default: {
      const exhaustiveCheck: never = failOn;
      return exhaustiveCheck;
    }
  }
}
