import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { OpenApiTemplate } from "../../shared/types.js";
import type { LoadedConfigFile, NextOpenApiConfigFile } from "./types.js";

export const LEGACY_CONFIG_FILENAMES = [
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

export const MODERN_CONFIG_FILENAMES = [
  "openapi-gen.config.ts",
  "openapi-gen.config.mts",
  "openapi-gen.config.js",
  "openapi-gen.config.mjs",
  path.join("src", "openapi-gen.config.ts"),
  path.join("src", "openapi-gen.config.mts"),
  path.join("src", "openapi-gen.config.js"),
  path.join("src", "openapi-gen.config.mjs"),
  "openapi-gen.config.json",
] as const;

export const DEFAULT_CONFIG_FILENAMES = [
  ...LEGACY_CONFIG_FILENAMES,
  ...MODERN_CONFIG_FILENAMES,
] as const;

const warnedLegacyConfigPaths = new Set<string>();

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

  warnForLegacyConfigName(cwd, configPath);

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

function warnForLegacyConfigName(cwd: string, configPath: string): void {
  const relativeConfigPath = path.relative(cwd, configPath);
  if (
    !LEGACY_CONFIG_FILENAMES.includes(
      relativeConfigPath as (typeof LEGACY_CONFIG_FILENAMES)[number],
    )
  ) {
    return;
  }

  const warningKey = path.resolve(configPath);
  if (warnedLegacyConfigPaths.has(warningKey)) {
    return;
  }

  warnedLegacyConfigPaths.add(warningKey);
  process.emitWarning(
    `The config filename "${relativeConfigPath}" is deprecated and will be removed in a future major release. ` +
      `Prefer "${getModernConfigSuggestion(relativeConfigPath)}" instead.`,
    {
      type: "DeprecationWarning",
    },
  );
}

function getModernConfigSuggestion(configPath: string): string {
  if (configPath.endsWith("next.openapi.json")) {
    return configPath.replace("next.openapi.json", "openapi-gen.config.ts");
  }

  return configPath.replace("next-openapi.config", "openapi-gen.config");
}
