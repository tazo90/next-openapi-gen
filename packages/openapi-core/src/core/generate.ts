import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import fse from "fs-extra";

import { OpenApiGenerator } from "../generator/openapi-generator.js";
import { logger } from "../shared/logger.js";
import type { GenerationAdapters } from "./adapters.js";
import { loadConfig } from "./config/load-config.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import { resolveGeneratedWorkspaceDir } from "./generated-workspace.js";
import type { SharedGenerationRuntime } from "./runtime.js";

export type GenerateProjectOptions = {
  adapters?: GenerationAdapters | undefined;
  cwd?: string | undefined;
  configPath?: string | undefined;
  runtime?: SharedGenerationRuntime | undefined;
};

export type GenerateProjectResult = {
  artifacts: GeneratedArtifact[];
  outputFile: string;
  configPath?: string | undefined;
};

export async function generateProject(
  options: GenerateProjectOptions = {},
): Promise<GenerateProjectResult> {
  const loadedConfig = await loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
  });

  return generateFromLoadedConfig(loadedConfig, options.runtime, options.adapters);
}

export async function generateFromLoadedConfig(
  loadedConfig: LoadedConfigFile,
  runtime?: SharedGenerationRuntime,
  adapters?: GenerationAdapters,
): Promise<GenerateProjectResult> {
  const generator = new OpenApiGenerator({
    adapters: adapters ?? missingGenerationAdapters(),
    config: loadedConfig.config,
    runtime,
  });
  const config = generator.getConfig();
  const document = generator.generate();

  const outputDir = path.resolve(config.outputDir);
  await fse.ensureDir(outputDir);

  const outputFile = path.join(outputDir, config.outputFile);
  fs.writeFileSync(outputFile, `${JSON.stringify(document, null, 2)}\n`);

  const artifacts: GeneratedArtifact[] = [{ kind: "spec", path: outputFile }];
  const generatedWorkspaceDir = resolveGeneratedWorkspaceDir(loadedConfig.config.generatedDir);
  await fse.ensureDir(generatedWorkspaceDir);

  fs.writeFileSync(
    path.join(generatedWorkspaceDir, "manifest.json"),
    `${JSON.stringify(
      {
        configPath: loadedConfig.configPath,
        outputFile,
        diagnostics: generator.getDiagnostics(),
        performance: generator.getPerformanceProfile(),
      },
      null,
      2,
    )}\n`,
  );

  const docsArtifact = await emitDocsArtifacts(loadedConfig, config.outputFile, adapters);
  if (docsArtifact) {
    artifacts.push(docsArtifact);
  }

  const sdkArtifacts = await emitClientSdkArtifacts(loadedConfig, outputFile);
  artifacts.push(...sdkArtifacts);

  loadedConfig.config.hooks?.artifactsWritten?.({
    config,
    artifacts,
  });

  logger.log(`Generated ${artifacts.length} artifact(s).`);

  return {
    artifacts,
    outputFile,
    configPath: loadedConfig.configPath,
  };
}

async function emitDocsArtifacts(
  loadedConfig: LoadedConfigFile,
  outputFile: string,
  adapters?: GenerationAdapters,
): Promise<GeneratedArtifact | null> {
  if (!adapters?.emitDocsArtifact) {
    return null;
  }

  return adapters.emitDocsArtifact({
    loadedConfig,
    outputFile,
  });
}

async function emitClientSdkArtifacts(
  loadedConfig: LoadedConfigFile,
  specPath: string,
): Promise<GeneratedArtifact[]> {
  const sdkConfigs =
    loadedConfig.config.clientSdk?.filter((config) => config.enabled !== false) ?? [];
  const artifacts: GeneratedArtifact[] = [];

  for (const sdkConfig of sdkConfigs) {
    await runExternalCommand(sdkConfig.command, [
      ...(sdkConfig.args ?? []),
      specPath,
      ...(sdkConfig.outputDir ? [sdkConfig.outputDir] : []),
    ]);
    if (sdkConfig.outputDir) {
      artifacts.push({
        kind: "sdk",
        path: path.resolve(process.cwd(), sdkConfig.outputDir),
      });
    }
  }

  return artifacts;
}

function runExternalCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code ?? "unknown"})`));
    });
    child.on("error", reject);
  });
}

function missingGenerationAdapters(): never {
  throw new Error("Generation adapters are required to generate OpenAPI artifacts.");
}
