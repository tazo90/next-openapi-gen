import fs from "fs";
import { createRequire } from "module";
import path from "path";

import type * as ts from "typescript";

export type TypeScriptRuntime = typeof ts;

export type NativeTypeScriptRuntime = {
  ast: Record<string, unknown>;
  sync: Record<string, unknown>;
};

export type TypeScriptVersionSupport = "supported" | "too-old" | "too-new";

export type ResolvedTypeScriptRuntime = {
  fallbackReason?: string;
  native?: NativeTypeScriptRuntime;
  ts?: TypeScriptRuntime;
  packagePath: string;
  requestedPackagePath?: string;
  requestedVersion?: string;
  version: string;
  support: TypeScriptVersionSupport;
};

type LoadedTypeScriptRuntime = Omit<ResolvedTypeScriptRuntime, "packagePath"> & {
  packagePath?: string;
};

const MINIMUM_TYPESCRIPT_MAJOR = 5;
const MINIMUM_TYPESCRIPT_MINOR = 9;
const MAXIMUM_TYPESCRIPT_MAJOR_EXCLUSIVE = 8;

const require = createRequire(import.meta.url);
const runtimeCache = new Map<string, ResolvedTypeScriptRuntime>();
let fallbackTypeScriptPackageRoot: string | undefined;

export class TypeScriptUnavailableError extends Error {
  public readonly packagePath: string;
  public readonly support: TypeScriptVersionSupport;
  public readonly version: string;

  constructor(runtime: ResolvedTypeScriptRuntime) {
    super(getTypeScriptUnavailableMessage(runtime));
    this.name = "TypeScriptUnavailableError";
    this.packagePath = runtime.packagePath;
    this.support = runtime.support;
    this.version = runtime.version;
  }
}

export function resolveTypeScriptRuntime(fromPath: string): ResolvedTypeScriptRuntime {
  const packageRoot = resolveTypeScriptPackageRoot(fromPath);
  const cachedRuntime = runtimeCache.get(packageRoot);
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const loadedPackage = loadTypeScriptPackage(packageRoot);
  const resolvedRuntime = {
    ...loadedPackage,
    packagePath: loadedPackage.packagePath ?? packageRoot,
  };
  runtimeCache.set(packageRoot, resolvedRuntime);
  return resolvedRuntime;
}

export function getTypeScriptVersionSupport(version: string): TypeScriptVersionSupport {
  const parsed = parseTypeScriptVersion(version);
  if (!parsed) {
    return "too-new";
  }

  if (
    parsed.major < MINIMUM_TYPESCRIPT_MAJOR ||
    (parsed.major === MINIMUM_TYPESCRIPT_MAJOR && parsed.minor < MINIMUM_TYPESCRIPT_MINOR)
  ) {
    return "too-old";
  }

  if (parsed.major >= MAXIMUM_TYPESCRIPT_MAJOR_EXCLUSIVE) {
    return "too-new";
  }

  return "supported";
}

export function getBestEffortScriptTarget(runtime: TypeScriptRuntime): ts.ScriptTarget {
  const scriptTarget = runtime.ScriptTarget as typeof runtime.ScriptTarget & {
    Latest?: ts.ScriptTarget;
    LatestStandard?: ts.ScriptTarget;
  };
  return scriptTarget.LatestStandard ?? scriptTarget.Latest ?? runtime.ScriptTarget.ES2022;
}

export function clearTypeScriptRuntimeCache(): void {
  runtimeCache.clear();
  fallbackTypeScriptPackageRoot = undefined;
}

export function isTypeScriptUnavailableError(error: unknown): error is TypeScriptUnavailableError {
  return error instanceof TypeScriptUnavailableError;
}

function resolveTypeScriptPackageRoot(fromPath: string): string {
  const searchDirectory = path.dirname(path.resolve(fromPath));
  try {
    return path.dirname(require.resolve("typescript/package.json", { paths: [searchDirectory] }));
  } catch {
    return resolveFallbackTypeScriptPackageRoot();
  }
}

function resolveFallbackTypeScriptPackageRoot(): string {
  fallbackTypeScriptPackageRoot ??= path.dirname(require.resolve("typescript/package.json"));
  return fallbackTypeScriptPackageRoot;
}

function loadTypeScriptPackage(packageRoot: string): LoadedTypeScriptRuntime {
  const version = readTypeScriptPackageVersion(packageRoot);
  const support = getTypeScriptVersionSupport(version);
  if (support !== "supported") {
    return { version, support };
  }

  if (parseTypeScriptVersion(version)?.major === 7) {
    const nativeRuntime = tryLoadNativeTypeScriptPackage(packageRoot);
    if (nativeRuntime.runtime) {
      return {
        native: nativeRuntime.runtime,
        version,
        support,
      };
    }

    const fallbackRuntime = tryLoadBundledClassicTypeScriptPackage(packageRoot);
    if (fallbackRuntime) {
      return {
        ...fallbackRuntime,
        fallbackReason: `TypeScript ${version} at ${packageRoot} does not expose the native compiler API (${formatLoadError(nativeRuntime.error)}); using bundled TypeScript ${fallbackRuntime.version} at ${fallbackRuntime.packagePath}.`,
        requestedPackagePath: packageRoot,
        requestedVersion: version,
      };
    }

    return {
      version,
      support,
      fallbackReason: `TypeScript ${version} at ${packageRoot} does not expose the native compiler API (${formatLoadError(nativeRuntime.error)}) and no bundled TypeScript 6 compatibility package could be loaded.`,
    };
  }

  return loadClassicTypeScriptPackage(packageRoot, version);
}

function readTypeScriptPackageVersion(packageRoot: string): string {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function loadClassicTypeScriptPackage(
  packageRoot: string,
  version: string = readTypeScriptPackageVersion(packageRoot),
): LoadedTypeScriptRuntime {
  const classicTypeScriptPath = require.resolve(path.join(packageRoot, "lib", "typescript.js"));
  return {
    packagePath: packageRoot,
    ts: require(classicTypeScriptPath) as TypeScriptRuntime,
    version,
    support: getTypeScriptVersionSupport(version),
  };
}

function tryLoadBundledClassicTypeScriptPackage(
  originalPackageRoot: string,
): LoadedTypeScriptRuntime | null {
  try {
    const fallbackPackageRoot = resolveFallbackTypeScriptPackageRoot();
    if (fallbackPackageRoot === originalPackageRoot) {
      return null;
    }

    const fallbackVersion = readTypeScriptPackageVersion(fallbackPackageRoot);
    if (getTypeScriptVersionSupport(fallbackVersion) !== "supported") {
      return null;
    }

    return loadClassicTypeScriptPackage(fallbackPackageRoot, fallbackVersion);
  } catch {
    return null;
  }
}

function loadNativeTypeScriptPackage(packageRoot: string): NativeTypeScriptRuntime {
  const syncPath = require.resolve("typescript/unstable/sync", { paths: [packageRoot] });
  const astPath = require.resolve("typescript/unstable/ast", { paths: [packageRoot] });
  return {
    ast: require(astPath) as Record<string, unknown>,
    sync: require(syncPath) as Record<string, unknown>,
  };
}

function tryLoadNativeTypeScriptPackage(packageRoot: string): {
  error?: unknown;
  runtime?: NativeTypeScriptRuntime;
} {
  try {
    return { runtime: loadNativeTypeScriptPackage(packageRoot) };
  } catch (error) {
    return { error };
  }
}

function getTypeScriptUnavailableMessage(runtime: ResolvedTypeScriptRuntime): string {
  if (runtime.support === "too-old") {
    return `TypeScript ${runtime.version} is too old for next-openapi-gen. Install TypeScript 5.9 or newer.`;
  }

  if (runtime.fallbackReason) {
    return `TypeScript checker features are unavailable. ${runtime.fallbackReason}`;
  }

  return `TypeScript ${runtime.version} is not supported by next-openapi-gen.`;
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseTypeScriptVersion(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}
