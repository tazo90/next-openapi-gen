import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import fse from "fs-extra";

import { OpenApiGenerator } from "../generator/openapi-generator.js";
import { logger } from "../shared/logger.js";
import type { Diagnostic, DiagnosticFailOn } from "../shared/types.js";
import type { GenerationAdapters } from "./adapters.js";
import { loadConfig } from "./config/load-config.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import { resolveGeneratedWorkspaceDir } from "./generated-workspace.js";
import { createSharedGenerationRuntime, type SharedGenerationRuntime } from "./runtime.js";

export type GenerateProjectOptions = {
  adapters?: GenerationAdapters | undefined;
  cwd?: string | undefined;
  configPath?: string | undefined;
  runtime?: SharedGenerationRuntime | undefined;
};

export type GenerateProjectResult = {
  artifacts: GeneratedArtifact[];
  cached?: boolean | undefined;
  diagnostics: Diagnostic[];
  diagnosticsFailOn: DiagnosticFailOn;
  outputFile: string;
  configPath?: string | undefined;
};

type DiskCacheRecord = {
  configPath?: string | undefined;
  diagnostics: Diagnostic[];
  fingerprint: string;
  inputCount: number;
  inputs?: Record<string, DiskCacheInputRecord> | undefined;
  outputFile: string;
  performance: unknown;
  updatedAt: string;
};

type DiskCacheInputRecord = {
  hash: string;
  mtimeMs: number;
  size: number;
};

const processRuntimeCache = new Map<string, SharedGenerationRuntime>();

export async function generateProject(
  options: GenerateProjectOptions = {},
): Promise<GenerateProjectResult> {
  const loadedConfig = await loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
  });

  return await generateFromLoadedConfig(loadedConfig, options.runtime, options.adapters);
}

export async function generateFromLoadedConfig(
  loadedConfig: LoadedConfigFile,
  runtime?: SharedGenerationRuntime,
  adapters?: GenerationAdapters,
): Promise<GenerateProjectResult> {
  const cacheKey = getProcessCacheKey(loadedConfig);
  const generatorRuntime =
    runtime ?? (isCacheEnabled(loadedConfig.config) ? getProcessRuntime(cacheKey) : undefined);
  const generator = new OpenApiGenerator({
    adapters: adapters ?? missingGenerationAdapters(),
    config: loadedConfig.config,
    runtime: generatorRuntime,
  });
  const config = generator.getConfig();
  const outputDir = path.resolve(config.outputDir);
  const outputFile = path.join(outputDir, config.outputFile);
  const diskCache = createDiskCacheContext(loadedConfig, outputFile);
  if (diskCache && !hasArtifactSideEffects(loadedConfig)) {
    const cachedResult = readCachedResult(diskCache, config.diagnostics.failOn ?? "never");
    if (cachedResult) {
      logger.log(`OpenAPI specification cache hit at ${cachedResult.outputFile}`);
      return cachedResult;
    }
  }

  const document = generator.generate();

  await fse.ensureDir(outputDir);

  fs.writeFileSync(outputFile, `${JSON.stringify(document, null, 2)}\n`);

  const artifacts: GeneratedArtifact[] = [{ kind: "spec", path: outputFile }];

  // Dev-only metadata (diagnostics, perf): omit during production builds so deploy
  // artifacts stay limited to the OpenAPI spec and optional docs/SDK outputs.
  if (process.env.NODE_ENV !== "production") {
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
  }

  if (diskCache) {
    writeDiskCacheRecord(diskCache, {
      configPath: loadedConfig.configPath,
      diagnostics: generator.getDiagnostics(),
      fingerprint: diskCache.fingerprint,
      inputCount: diskCache.inputCount,
      inputs: diskCache.inputs,
      outputFile,
      performance: generator.getPerformanceProfile(),
      updatedAt: new Date().toISOString(),
    });
  }

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
    cached: false,
    diagnostics: generator.getDiagnostics(),
    diagnosticsFailOn: config.diagnostics.failOn ?? "never",
    outputFile,
    configPath: loadedConfig.configPath,
  };
}

function getProcessRuntime(cacheKey: string): SharedGenerationRuntime {
  const cachedRuntime = processRuntimeCache.get(cacheKey);
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const runtime = createSharedGenerationRuntime();
  processRuntimeCache.set(cacheKey, runtime);
  return runtime;
}

function getProcessCacheKey(loadedConfig: LoadedConfigFile): string {
  return path.resolve(
    loadedConfig.configPath ? path.dirname(loadedConfig.configPath) : process.cwd(),
  );
}

function isCacheEnabled(config: LoadedConfigFile["config"]): boolean {
  return config.experimental?.cache === true || process.env.OPENAPI_GEN_CACHE === "1";
}

function hasArtifactSideEffects(loadedConfig: LoadedConfigFile): boolean {
  return (
    (loadedConfig.config.docs ? loadedConfig.config.docs.enabled !== false : false) ||
    (loadedConfig.config.clientSdk?.some((sdkConfig) => sdkConfig.enabled !== false) ?? false)
  );
}

function createDiskCacheContext(
  loadedConfig: LoadedConfigFile,
  outputFile: string,
): {
  cacheFile: string;
  fingerprint: string;
  inputs: Record<string, DiskCacheInputRecord>;
  inputCount: number;
  outputFile: string;
} | null {
  if (!isCacheEnabled(loadedConfig.config)) {
    return null;
  }

  const generatedWorkspaceDir = resolveGeneratedWorkspaceDir(loadedConfig.config.generatedDir);
  const inputFiles = collectCacheInputFiles(loadedConfig);
  const previousRecord = readDiskCacheRecord(
    path.join(generatedWorkspaceDir, "cache", "generate.json"),
  );
  const { fingerprint, inputs } = createInputFingerprint(inputFiles, previousRecord?.inputs);
  return {
    cacheFile: path.join(generatedWorkspaceDir, "cache", "generate.json"),
    fingerprint,
    inputs,
    inputCount: inputFiles.length,
    outputFile,
  };
}

function readCachedResult(
  diskCache: {
    cacheFile: string;
    fingerprint: string;
    outputFile: string;
  },
  diagnosticsFailOn: DiagnosticFailOn,
): GenerateProjectResult | null {
  if (!fs.existsSync(diskCache.cacheFile) || !fs.existsSync(diskCache.outputFile)) {
    return null;
  }

  const record = readDiskCacheRecord(diskCache.cacheFile);
  if (!record) {
    return null;
  }
  if (record.fingerprint !== diskCache.fingerprint || record.outputFile !== diskCache.outputFile) {
    return null;
  }

  return {
    artifacts: [{ kind: "spec", path: diskCache.outputFile }],
    cached: true,
    diagnostics: record.diagnostics,
    diagnosticsFailOn,
    outputFile: diskCache.outputFile,
    configPath: record.configPath,
  };
}

function writeDiskCacheRecord(
  diskCache: {
    cacheFile: string;
  },
  record: DiskCacheRecord,
): void {
  fs.mkdirSync(path.dirname(diskCache.cacheFile), { recursive: true });
  fs.writeFileSync(diskCache.cacheFile, `${JSON.stringify(record, null, 2)}\n`);
}

function readDiskCacheRecord(cacheFile: string): DiskCacheRecord | null {
  if (!fs.existsSync(cacheFile)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as DiskCacheRecord;
}

function collectCacheInputFiles(loadedConfig: LoadedConfigFile): string[] {
  const roots = [
    loadedConfig.config.apiDir,
    ...(Array.isArray(loadedConfig.config.schemaDir)
      ? loadedConfig.config.schemaDir
      : [loadedConfig.config.schemaDir]),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));
  const explicitFiles = [
    loadedConfig.configPath,
    ...findNearestFiles(["tsconfig.json", "package.json", "pnpm-lock.yaml"]),
    ...(loadedConfig.config.schemaFiles ?? []),
  ].filter((value): value is string => Boolean(value));

  const files = new Set<string>();
  for (const root of roots) {
    collectFiles(root, files);
  }
  for (const file of explicitFiles) {
    const resolvedFile = path.resolve(file);
    if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isFile()) {
      files.add(resolvedFile);
    }
  }

  return [...files].toSorted((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function collectFiles(root: string, files: Set<string>): void {
  if (!fs.existsSync(root)) {
    return;
  }

  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (isCacheInputFile(root)) {
      files.add(root);
    }
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(root).toSorted((a, b) => a.localeCompare(b, "en"))) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === ".openapi-gen"
    ) {
      continue;
    }
    collectFiles(path.join(root, entry), files);
  }
}

function isCacheInputFile(filePath: string): boolean {
  return /\.(cjs|cts|js|json|jsx|mjs|mts|ts|tsx|yaml|yml)$/.test(filePath);
}

function findNearestFiles(fileNames: string[]): string[] {
  const result: string[] = [];
  let currentDir = process.cwd();
  while (true) {
    for (const fileName of fileNames) {
      const candidate = path.join(currentDir, fileName);
      if (fs.existsSync(candidate)) {
        result.push(candidate);
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return result;
    }
    currentDir = parentDir;
  }
}

function createInputFingerprint(
  files: string[],
  previousInputs: Record<string, DiskCacheInputRecord> = {},
): {
  fingerprint: string;
  inputs: Record<string, DiskCacheInputRecord>;
} {
  const hash = crypto.createHash("sha256");
  const inputs: Record<string, DiskCacheInputRecord> = {};
  for (const file of files) {
    const stat = fs.statSync(file);
    const previousInput = previousInputs[file];
    const fileHash =
      previousInput && previousInput.mtimeMs === stat.mtimeMs && previousInput.size === stat.size
        ? previousInput.hash
        : createFileHash(file);
    inputs[file] = {
      hash: fileHash,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
    hash.update(file);
    hash.update(String(stat.mtimeMs));
    hash.update(String(stat.size));
    hash.update(fileHash);
  }
  return {
    fingerprint: hash.digest("hex"),
    inputs,
  };
}

function createFileHash(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function emitDocsArtifacts(
  loadedConfig: LoadedConfigFile,
  outputFile: string,
  adapters?: GenerationAdapters,
): Promise<GeneratedArtifact | null> {
  if (!adapters?.emitDocsArtifact) {
    return null;
  }

  return await adapters.emitDocsArtifact({
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
