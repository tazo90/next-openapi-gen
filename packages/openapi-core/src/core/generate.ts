import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import fse from "fs-extra";

import { resolveCacheSetting } from "../config/normalize.js";
import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { OpenApiGenerator } from "../generator/openapi-generator.js";
import { logger } from "../shared/logger.js";
import type { Diagnostic, DiagnosticFailOn } from "../shared/types.js";
import type { GenerationAdapters, GenerationContext, SpecEmitter } from "./adapters.js";
import { writeDocumentArtifact } from "./artifact-writer.js";
import { loadConfig } from "./config/load-config.js";
import type { GeneratedArtifact, LoadedConfigFile } from "./config/types.js";
import { expandFileGlobs } from "./file-globs.js";
import { resolveGeneratedWorkspaceDir } from "./generated-workspace.js";
import { buildGenerationIR } from "./generation-ir.js";
import { createInputFingerprint, type DiskCacheInputRecord } from "./input-fingerprint.js";
import {
  createSharedGenerationRuntime,
  type CachedRouteFragment,
  type SharedGenerationRuntime,
} from "./runtime.js";

export type ExternalCommandRunner = (command: string, args: string[]) => Promise<void>;

export type GenerateProjectOptions = {
  adapters?: GenerationAdapters | undefined;
  cwd?: string | undefined;
  configPath?: string | undefined;
  runtime?: SharedGenerationRuntime | undefined;
  runCommand?: ExternalCommandRunner | undefined;
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
  routeFragments?: Record<string, CachedRouteFragment> | undefined;
  updatedAt: string;
};

export { createInputFingerprint };

const processRuntimeCache = new Map<string, SharedGenerationRuntime>();

export async function generateProject(
  options: GenerateProjectOptions = {},
): Promise<GenerateProjectResult> {
  const loadedConfig = await loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
  });

  return await generateFromLoadedConfig(
    loadedConfig,
    options.runtime,
    options.adapters,
    options.runCommand,
  );
}

export async function generateFromLoadedConfig(
  loadedConfig: LoadedConfigFile,
  runtime?: SharedGenerationRuntime,
  adapters?: GenerationAdapters,
  runCommand: ExternalCommandRunner = runExternalCommand,
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
  if (diskCache?.routeFragments && generatorRuntime) {
    generatorRuntime.routeScan.routeFragments = new Map(Object.entries(diskCache.routeFragments));
  }
  if (diskCache && !hasArtifactSideEffects(loadedConfig)) {
    const cachedResult = readCachedResult(diskCache, config.diagnostics.failOn as DiagnosticFailOn);
    if (cachedResult) {
      logger.log(`OpenAPI specification cache hit at ${cachedResult.outputFile}`);
      return cachedResult;
    }
  }

  const document = generator.generate();
  const diagnostics = new DiagnosticsCollector();
  for (const diagnostic of generator.getDiagnostics()) {
    diagnostics.add(diagnostic);
  }

  const cwd = loadedConfig.configPath ? path.dirname(loadedConfig.configPath) : process.cwd();
  const context: GenerationContext = {
    config,
    ir: buildGenerationIR(document),
    openapiDocument: document,
    diagnostics,
    outputFile,
    outputDir,
    cwd,
  };

  const specEmitters = adapters?.createSpecEmitters?.(config) ?? [];
  const overlayEmitters = specEmitters.filter((emitter) => emitter.kind === "overlay");
  const arazzoEmitters = specEmitters.filter((emitter) => emitter.kind === "arazzo");

  const artifacts: GeneratedArtifact[] = [];
  artifacts.push(...(await emitSpecEmitters(overlayEmitters, context)));

  await fse.ensureDir(outputDir);
  writeDocumentArtifact(outputFile, context.openapiDocument);
  artifacts.unshift({ kind: "spec", path: outputFile });

  context.ir = buildGenerationIR(context.openapiDocument);
  artifacts.push(...(await emitSpecEmitters(arazzoEmitters, context)));

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
          diagnostics: diagnostics.getAll(),
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
      diagnostics: diagnostics.getAll(),
      fingerprint: diskCache.fingerprint,
      inputCount: diskCache.inputCount,
      inputs: diskCache.inputs,
      outputFile,
      performance: generator.getPerformanceProfile(),
      routeFragments: Object.fromEntries(generatorRuntime!.routeScan.routeFragments),
      updatedAt: new Date().toISOString(),
    });
  }

  const docsArtifact = await emitDocsArtifacts(loadedConfig, config.outputFile, adapters);
  if (docsArtifact) {
    artifacts.push(docsArtifact);
  }

  const sdkArtifacts = await emitClientSdkArtifacts(loadedConfig, outputFile, runCommand);
  artifacts.push(...sdkArtifacts);

  loadedConfig.config.hooks?.artifactsWritten?.({
    config,
    artifacts,
  });

  logger.log(`Generated ${artifacts.length} artifact(s).`);

  return {
    artifacts,
    cached: false,
    diagnostics: diagnostics.getAll(),
    diagnosticsFailOn: config.diagnostics.failOn as DiagnosticFailOn,
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
  if (process.env.OPENAPI_GEN_CACHE === "0") {
    return false;
  }

  if (process.env.OPENAPI_GEN_CACHE === "1") {
    return true;
  }

  return resolveCacheSetting(config);
}

function hasArtifactSideEffects(loadedConfig: LoadedConfigFile): boolean {
  return (
    (loadedConfig.config.docs ? loadedConfig.config.docs.enabled !== false : false) ||
    (loadedConfig.config.clientSdk?.some((sdkConfig) => sdkConfig.enabled !== false) ?? false) ||
    Boolean(loadedConfig.config.arazzo) ||
    Boolean(loadedConfig.config.overlay)
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
  routeFragments?: Record<string, CachedRouteFragment> | undefined;
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
  const routeFragments = canReuseRouteFragments(loadedConfig, inputs, previousRecord)
    ? previousRecord.routeFragments
    : undefined;
  return {
    cacheFile: path.join(generatedWorkspaceDir, "cache", "generate.json"),
    fingerprint,
    inputs,
    inputCount: inputFiles.length,
    outputFile,
    routeFragments,
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

  const companionPatterns = [
    ...(loadedConfig.config.arazzo?.files ?? []),
    ...(loadedConfig.config.overlay?.apply ?? []),
    ...(loadedConfig.config.overlay?.generate?.files ?? []),
  ];
  const cwd = loadedConfig.configPath ? path.dirname(loadedConfig.configPath) : process.cwd();
  for (const file of expandFileGlobs(companionPatterns, cwd)) {
    files.add(file);
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

function canReuseRouteFragments(
  loadedConfig: LoadedConfigFile,
  currentInputs: Record<string, DiskCacheInputRecord>,
  previousRecord: DiskCacheRecord | null,
): previousRecord is DiskCacheRecord & {
  routeFragments: Record<string, CachedRouteFragment>;
} {
  if (!previousRecord?.routeFragments || !previousRecord.inputs) {
    return false;
  }

  const apiDir = path.resolve(loadedConfig.config.apiDir ?? "./src/app/api");
  return Object.entries(currentInputs).every(([filePath, input]) => {
    const previousInput = previousRecord.inputs?.[filePath];
    if (
      previousInput &&
      previousInput.hash === input.hash &&
      previousInput.mtimeMs === input.mtimeMs &&
      previousInput.size === input.size
    ) {
      return true;
    }

    const relativePath = path.relative(apiDir, filePath);
    return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  });
}

async function emitSpecEmitters(
  emitters: SpecEmitter[],
  context: GenerationContext,
): Promise<GeneratedArtifact[]> {
  const emitted = await Promise.all(emitters.map((emitter) => emitter.emit(context)));
  return emitted.flat();
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
  runCommand: ExternalCommandRunner,
): Promise<GeneratedArtifact[]> {
  const sdkConfigs =
    loadedConfig.config.clientSdk?.filter((config) => config.enabled !== false) ?? [];
  const artifacts: GeneratedArtifact[] = [];

  for (const sdkConfig of sdkConfigs) {
    await runCommand(sdkConfig.command, [
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

export function runExternalCommand(command: string, args: string[]): Promise<void> {
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
