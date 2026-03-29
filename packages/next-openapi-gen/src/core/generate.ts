import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import fse from "fs-extra";

import { OpenApiGenerator } from "../generator/openapi-generator.js";
import { createNextDocsPage } from "../frameworks/next/docs-page-processor.js";
import { logger } from "../shared/logger.js";
import { FrameworkKind } from "../shared/types.js";
import { loadConfig } from "./config/load-config.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import { resolveGeneratedWorkspaceDir } from "./generated-workspace.js";
import type { SharedGenerationRuntime } from "./runtime.js";

export type GenerateProjectOptions = {
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

  return generateFromLoadedConfig(loadedConfig, options.runtime);
}

export async function generateFromLoadedConfig(
  loadedConfig: LoadedConfigFile,
  runtime?: SharedGenerationRuntime,
): Promise<GenerateProjectResult> {
  const generator = new OpenApiGenerator({
    config: loadedConfig.config,
    runtime,
  });
  const config = generator.getConfig();
  const document = generator.generate();

  const outputDir = path.resolve(config.outputDir);
  await fse.ensureDir(outputDir);

  const outputFile = path.join(outputDir, config.outputFile);
  fs.writeFileSync(outputFile, JSON.stringify(document, null, 2));

  const artifacts: GeneratedArtifact[] = [{ kind: "spec", path: outputFile }];
  const generatedWorkspaceDir = resolveGeneratedWorkspaceDir(loadedConfig.config.generatedDir);
  await fse.ensureDir(generatedWorkspaceDir);

  fs.writeFileSync(
    path.join(generatedWorkspaceDir, "manifest.json"),
    JSON.stringify(
      {
        configPath: loadedConfig.configPath,
        outputFile,
        diagnostics: generator.getDiagnostics(),
        performance: generator.getPerformanceProfile(),
      },
      null,
      2,
    ),
  );

  const docsArtifact = await emitDocsArtifacts(loadedConfig, config.outputFile);
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
): Promise<GeneratedArtifact | null> {
  if (loadedConfig.config.docs?.enabled !== true) {
    return null;
  }

  if (loadedConfig.config.framework?.kind !== FrameworkKind.Nextjs) {
    return null;
  }

  const docsPath = await createNextDocsPage(
    loadedConfig.config.docsUrl ?? "api-docs",
    loadedConfig.config.ui ?? "scalar",
    outputFile,
  );

  if (!docsPath) {
    return null;
  }

  return {
    kind: "docs",
    path: path.resolve(process.cwd(), docsPath),
  };
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
