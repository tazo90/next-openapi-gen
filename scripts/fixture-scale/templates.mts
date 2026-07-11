import fs from "node:fs";
import path from "node:path";

import type { FrameworkKind } from "./routes.mts";
import type { SchemaFlavor } from "./schemas.mts";
import type { TemplateOptions } from "./targets.mts";
import { writeJsonFile } from "./utils.mts";

type OpenApiVersion = "3.0" | "3.1" | "3.2";

type TemplateOptions = {
  title: string;
  description: string;
  framework?: FrameworkKind;
  schemaType: SchemaFlavor | SchemaFlavor[] | "typescript";
  apiDir: string;
  schemaDir: string;
  includeOpenApiRoutes?: boolean;
  ignoreRoutes?: string[];
  templateSource?: string;
  extra?: Record<string, unknown>;
};

export function emitOpenApiTemplates(
  outputDir: string,
  options: TemplateOptions,
  dryRun: boolean,
): string[] {
  const written: string[] = [];
  const versions: OpenApiVersion[] = ["3.0", "3.1", "3.2"];

  for (const version of versions) {
    const baseTemplate = options.templateSource
      ? (JSON.parse(
          fs.readFileSync(
            path.join(options.templateSource, "templates", `openapi-${version}.json`),
            "utf-8",
          ),
        ) as Record<string, unknown>)
      : {};
    const template = {
      ...baseTemplate,
      openapi: `${version}.0`,
      info: {
        title: options.title,
        version: "1.0.0",
        description: options.description,
      },
      apiDir: options.apiDir,
      schemaDir: options.schemaDir,
      schemaType: options.schemaType,
      docsUrl: "api-docs",
      ui: "scalar",
      outputDir: "./public",
      outputFile: "openapi.json",
      includeOpenApiRoutes: options.includeOpenApiRoutes ?? true,
      debug: false,
      ...(options.ignoreRoutes ? { ignoreRoutes: options.ignoreRoutes } : {}),
      ...(options.framework === "tanstack"
        ? {
            framework: { kind: "tanstack" },
            defaultResponseSet: "common",
            responseSets: {
              common: ["400", "500"],
              auth: ["401", "403"],
            },
          }
        : {}),
      ...(options.framework === "react-router"
        ? {
            framework: { kind: "reactrouter" },
            defaultResponseSet: "common",
            responseSets: {
              common: ["400", "500"],
              auth: ["401", "403"],
            },
          }
        : {}),
      ...options.extra,
    };

    const filePath = path.join(outputDir, "templates", `openapi-${version}.json`);
    writeJsonFile(filePath, template, dryRun);
    written.push(filePath);
  }

  return written;
}
