import fs from "fs";
import { createRequire } from "module";
import path from "path";

import type * as ts from "typescript";

export type TypeScriptRuntime = typeof ts;

export type NativeTypeScriptRuntime = {
  ast: Record<string, unknown>;
  sync: Record<string, unknown>;
};

export type TypeScriptVersionSupport = "supported" | "too-old" | "too-new" | "unsupported-native";

export type ResolvedTypeScriptRuntime = {
  native?: NativeTypeScriptRuntime;
  ts?: TypeScriptRuntime;
  packagePath: string;
  version: string;
  support: TypeScriptVersionSupport;
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
    packagePath: packageRoot,
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

function loadTypeScriptPackage(
  packageRoot: string,
): Omit<ResolvedTypeScriptRuntime, "packagePath"> {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ) as { version?: string };
  const version = packageJson.version ?? "0.0.0";
  const support = getTypeScriptVersionSupport(version);
  if (support !== "supported") {
    return { version, support };
  }

  if (parseTypeScriptVersion(version)?.major === 7) {
    return {
      native: loadNativeTypeScriptPackage(packageRoot),
      version,
      support,
    };
  }

  const classicTypeScriptPath = require.resolve(path.join(packageRoot, "lib", "typescript.js"));
  return {
    ts: require(classicTypeScriptPath) as TypeScriptRuntime,
    version,
    support,
  };
}

function loadNativeTypeScriptPackage(packageRoot: string): NativeTypeScriptRuntime {
  const syncPath = require.resolve(path.join(packageRoot, "dist", "api", "sync", "api.js"));
  const astPath = require.resolve(path.join(packageRoot, "dist", "ast", "index.js"));
  return {
    ast: require(astPath) as Record<string, unknown>,
    sync: require(syncPath) as Record<string, unknown>,
  };
}

function getTypeScriptUnavailableMessage(runtime: ResolvedTypeScriptRuntime): string {
  if (runtime.support === "unsupported-native") {
    return `TypeScript ${runtime.version} uses the native compiler API, which does not expose the classic compiler API used by next-openapi-gen. TypeScript-checker features are temporarily disabled until native API support is added.`;
  }

  if (runtime.support === "too-old") {
    return `TypeScript ${runtime.version} is too old for next-openapi-gen. Install TypeScript 5.9 or newer.`;
  }

  return `TypeScript ${runtime.version} is not supported by next-openapi-gen.`;
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
