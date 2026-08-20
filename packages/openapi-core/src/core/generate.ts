import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import spawn from "cross-spawn";
import fse from "fs-extra";

import { normalizeOpenApiConfig, resolveCacheSetting } from "../config/normalize.js";
import { DiagnosticsCollector } from "../diagnostics/collector.js";
import { OpenApiGenerator } from "../generator/openapi-generator.js";
import { IGNORED_SOURCE_DIRECTORIES } from "../shared/ignored-directories.js";
import { logger } from "../shared/logger.js";
import { isPathWithin } from "../shared/path.js";
import type { Diagnostic, DiagnosticFailOn, OpenApiDocument } from "../shared/types.js";
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
  invalidateRuntimePaths,
  resetSharedGenerationRuntime,
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
  baseDocumentFile: string;
  cacheVersion?: number | undefined;
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

type DiskCacheContext = {
  baseDocumentFile: string;
  cacheFile: string;
  changedFiles: string[];
  fingerprint: string;
  inputCount: number;
  inputs: Record<string, DiskCacheInputRecord>;
  hasValidPreviousMetadata: boolean;
  outputFile: string;
  previousRecord: DiskCacheRecord | null;
  routeFragments?: Record<string, CachedRouteFragment> | undefined;
};

export { createInputFingerprint };

const DISK_CACHE_VERSION = 2;
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
  const resolvedConfig = normalizeOpenApiConfig(loadedConfig.config);
  const outputDir = path.resolve(resolvedConfig.outputDir);
  const outputFile = path.join(outputDir, resolvedConfig.outputFile);
  const diskCache = createDiskCacheContext(loadedConfig, outputFile);
  if (diskCache && generatorRuntime) {
    if (!diskCache.hasValidPreviousMetadata) {
      resetSharedGenerationRuntime(generatorRuntime);
    } else {
      if (diskCache.routeFragments) {
        generatorRuntime.routeScan.routeFragments = new Map(
          Object.entries(diskCache.routeFragments),
        );
      } else {
        generatorRuntime.routeScan.routeFragments.clear();
      }
      invalidateRuntimePaths(generatorRuntime, {
        files: diskCache.changedFiles,
        directories: diskCache.changedFiles.map((filePath) => path.dirname(filePath)),
      });
    }
  }
  const generator = new OpenApiGenerator({
    adapters: adapters ?? missingGenerationAdapters(),
    config: loadedConfig.config,
    runtime: generatorRuntime,
  });
  const config = generator.getConfig();
  const cachedResult = diskCache
    ? readCachedResult(diskCache, config.diagnostics.failOn as DiagnosticFailOn)
    : null;
  if (cachedResult && !hasArtifactSideEffects(loadedConfig)) {
    logger.log(`OpenAPI specification cache hit at ${cachedResult.outputFile}`);
    return cachedResult;
  }

  const cachedBaseDocument =
    cachedResult && diskCache ? readCachedBaseDocument(diskCache.baseDocumentFile) : null;
  if (cachedResult && cachedBaseDocument) {
    logger.log(`OpenAPI specification cache hit at ${cachedResult.outputFile}`);
  }

  const document = cachedBaseDocument ?? generator.generate();
  const baseDiagnostics = cachedBaseDocument
    ? (diskCache?.previousRecord?.diagnostics ?? [])
    : generator.getDiagnostics();
  const diagnostics = new DiagnosticsCollector();
  for (const diagnostic of baseDiagnostics) {
    diagnostics.add(diagnostic);
  }
  const performance = cachedResult
    ? diskCache?.previousRecord?.performance
    : generator.getPerformanceProfile();
  if (diskCache && !cachedBaseDocument) {
    writeJsonAtomically(diskCache.baseDocumentFile, document);
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
          performance,
        },
        null,
        2,
      )}\n`,
    );
  }

  if (diskCache) {
    writeDiskCacheRecord(diskCache, {
      baseDocumentFile: diskCache.baseDocumentFile,
      cacheVersion: DISK_CACHE_VERSION,
      configPath: loadedConfig.configPath,
      diagnostics: baseDiagnostics,
      fingerprint: diskCache.fingerprint,
      inputCount: diskCache.inputCount,
      inputs: diskCache.inputs,
      outputFile,
      performance,
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
    cached: Boolean(cachedBaseDocument),
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
    Boolean(loadedConfig.config.overlay) ||
    Boolean(loadedConfig.config.hooks?.artifactsWritten)
  );
}

function createDiskCacheContext(
  loadedConfig: LoadedConfigFile,
  outputFile: string,
): DiskCacheContext | null {
  if (!isCacheEnabled(loadedConfig.config)) {
    return null;
  }

  const generatedWorkspaceDir = resolveGeneratedWorkspaceDir(loadedConfig.config.generatedDir);
  const inputFiles = collectCacheInputFiles(loadedConfig);
  const cacheFile = path.join(generatedWorkspaceDir, "cache", "generate.json");
  const storedRecord = readDiskCacheRecord(cacheFile);
  const hasValidPreviousMetadata = isValidDiskCacheRecord(storedRecord);
  const previousRecord = hasValidPreviousMetadata ? storedRecord : null;
  const { fingerprint, inputs } = createInputFingerprint(inputFiles, previousRecord?.inputs);
  const changedFiles = getChangedInputFiles(inputs, previousRecord?.inputs);
  const routeFragments = canReuseRouteFragments(loadedConfig, changedFiles, previousRecord)
    ? previousRecord.routeFragments
    : undefined;
  return {
    baseDocumentFile: path.join(generatedWorkspaceDir, "cache", `base-openapi-${fingerprint}.json`),
    cacheFile,
    changedFiles,
    fingerprint,
    hasValidPreviousMetadata,
    inputs,
    inputCount: inputFiles.length,
    outputFile,
    previousRecord,
    routeFragments,
  };
}

function readCachedBaseDocument(baseDocumentFile: string): OpenApiDocument | null {
  try {
    return JSON.parse(fs.readFileSync(baseDocumentFile, "utf-8")) as OpenApiDocument;
  } catch {
    return null;
  }
}

function readCachedResult(
  diskCache: DiskCacheContext,
  diagnosticsFailOn: DiagnosticFailOn,
): GenerateProjectResult | null {
  if (!fs.existsSync(diskCache.outputFile)) {
    return null;
  }

  const record = diskCache.previousRecord;
  if (!record) {
    return null;
  }
  if (
    record.cacheVersion !== DISK_CACHE_VERSION ||
    record.fingerprint !== diskCache.fingerprint ||
    record.outputFile !== diskCache.outputFile ||
    record.baseDocumentFile !== diskCache.baseDocumentFile
  ) {
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
  writeJsonAtomically(diskCache.cacheFile, record);
}

function readDiskCacheRecord(cacheFile: string): DiskCacheRecord | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as DiskCacheRecord;
  } catch {
    try {
      fs.rmSync(cacheFile, { force: true });
    } catch {
      // A corrupt cache is still a miss when filesystem permissions prevent invalidation.
    }
    return null;
  }
}

function isValidDiskCacheRecord(record: DiskCacheRecord | null): record is DiskCacheRecord {
  return Boolean(
    record &&
    record.cacheVersion === DISK_CACHE_VERSION &&
    typeof record.baseDocumentFile === "string" &&
    typeof record.fingerprint === "string" &&
    record.inputs &&
    typeof record.inputs === "object" &&
    Array.isArray(record.diagnostics),
  );
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryFile = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryFile, filePath);
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
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
  const explicitCoreFiles = new Set<string>();
  for (const root of roots) {
    collectFiles(root, files);
  }
  for (const file of explicitFiles) {
    const resolvedFile = path.resolve(file);
    if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isFile()) {
      files.add(resolvedFile);
      explicitCoreFiles.add(resolvedFile);
      explicitCoreFiles.add(fs.realpathSync(resolvedFile));
    }
  }

  const artifactPatterns = [
    ...(loadedConfig.config.arazzo?.files ?? []),
    ...(loadedConfig.config.overlay?.apply ?? []),
    ...(loadedConfig.config.overlay?.generate?.files ?? []),
  ];
  const cwd = loadedConfig.configPath ? path.dirname(loadedConfig.configPath) : process.cwd();
  for (const artifactFile of expandFileGlobs(artifactPatterns, cwd)) {
    const canonicalArtifactFile = fs.realpathSync(artifactFile);
    if (!explicitCoreFiles.has(artifactFile) && !explicitCoreFiles.has(canonicalArtifactFile)) {
      files.delete(artifactFile);
      files.delete(canonicalArtifactFile);
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
    if (IGNORED_SOURCE_DIRECTORIES.has(entry) || entry === ".openapi-gen") {
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
  changedFiles: string[],
  previousRecord: DiskCacheRecord | null,
): previousRecord is DiskCacheRecord & {
  routeFragments: Record<string, CachedRouteFragment>;
} {
  if (
    previousRecord?.cacheVersion !== DISK_CACHE_VERSION ||
    !previousRecord.routeFragments ||
    !previousRecord.inputs
  ) {
    return false;
  }

  const sourceRoots = [
    loadedConfig.config.apiDir ?? "./src/app/api",
    ...(Array.isArray(loadedConfig.config.schemaDir)
      ? loadedConfig.config.schemaDir
      : [loadedConfig.config.schemaDir]),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));
  return changedFiles.every((filePath) => sourceRoots.some((root) => isPathWithin(root, filePath)));
}

function getChangedInputFiles(
  currentInputs: Record<string, DiskCacheInputRecord>,
  previousInputs: Record<string, DiskCacheInputRecord> | undefined,
): string[] {
  if (!previousInputs) {
    return [];
  }

  const filePaths = new Set([...Object.keys(currentInputs), ...Object.keys(previousInputs)]);
  return [...filePaths].filter((filePath) => {
    const current = currentInputs[filePath];
    const previous = previousInputs[filePath];
    return (
      !current ||
      !previous ||
      current.hash !== previous.hash ||
      current.mtimeMs !== previous.mtimeMs ||
      current.size !== previous.size
    );
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
      shell: false,
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
