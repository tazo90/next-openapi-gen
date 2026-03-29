import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { OpenApiTemplate } from "../../shared/types.js";
import type { LoadedConfigFile, NextOpenApiConfigFile } from "./types.js";

export const DEFAULT_CONFIG_FILENAMES = [
  "next-openapi.config.ts",
  "next-openapi.config.mts",
  "next-openapi.config.js",
  "next-openapi.config.mjs",
  path.join("src", "next-openapi.config.ts"),
  path.join("src", "next-openapi.config.mts"),
  path.join("src", "next-openapi.config.js"),
  path.join("src", "next-openapi.config.mjs"),
  "next.openapi.json",
] as const;

export type LoadConfigOptions = {
  cwd?: string | undefined;
  configPath?: string | undefined;
};

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfigFile> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const explicitPath = options.configPath ? path.resolve(cwd, options.configPath) : undefined;
  if (explicitPath && !fs.existsSync(explicitPath)) {
    throw new Error(`Config file not found at ${explicitPath}`);
  }
  const configPath = explicitPath ?? findDefaultConfigPath(cwd);

  if (!configPath) {
    throw new Error(
      `Could not find a config file. Looked for: ${DEFAULT_CONFIG_FILENAMES.join(", ")}`,
    );
  }

  if (configPath.endsWith(".json")) {
    return {
      config: JSON.parse(fs.readFileSync(configPath, "utf8")) as NextOpenApiConfigFile,
      configPath,
    };
  }

  const importedModule = (await import(pathToFileURL(configPath).href)) as {
    default?: NextOpenApiConfigFile;
    config?: NextOpenApiConfigFile;
  };
  const config = importedModule.default ?? importedModule.config;
  if (!config) {
    throw new Error(`Config module at ${configPath} must export a default config object.`);
  }

  return {
    config,
    configPath,
  };
}

export function isExtendedConfigFile(value: OpenApiTemplate): value is NextOpenApiConfigFile {
  return typeof value === "object" && value !== null;
}

function findDefaultConfigPath(cwd: string): string | undefined {
  for (const candidate of DEFAULT_CONFIG_FILENAMES) {
    const absoluteCandidate = path.resolve(cwd, candidate);
    if (fs.existsSync(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return undefined;
}
