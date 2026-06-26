import path from "path";
import { createRequire } from "module";

import type * as ts from "typescript";

export type TypeScriptRuntime = typeof ts;

export type TypeScriptVersionSupport = "supported" | "too-old" | "too-new";

export type ResolvedTypeScriptRuntime = {
  ts: TypeScriptRuntime;
  packagePath: string;
  version: string;
  support: TypeScriptVersionSupport;
};

const MINIMUM_TYPESCRIPT_MAJOR = 5;
const MINIMUM_TYPESCRIPT_MINOR = 9;
const MAXIMUM_TYPESCRIPT_MAJOR_EXCLUSIVE = 8;

const require = createRequire(import.meta.url);
const fallbackTypeScriptPath = require.resolve("typescript");
const runtimeCache = new Map<string, ResolvedTypeScriptRuntime>();

export function resolveTypeScriptRuntime(fromPath: string): ResolvedTypeScriptRuntime {
  const packagePath = resolveTypeScriptPackagePath(fromPath);
  const cachedRuntime = runtimeCache.get(packagePath);
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const runtime = require(packagePath) as TypeScriptRuntime;
  const resolvedRuntime = {
    ts: runtime,
    packagePath,
    version: runtime.version,
    support: getTypeScriptVersionSupport(runtime.version),
  };
  runtimeCache.set(packagePath, resolvedRuntime);
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
}

function resolveTypeScriptPackagePath(fromPath: string): string {
  const searchDirectory = path.dirname(path.resolve(fromPath));
  try {
    return require.resolve("typescript", { paths: [searchDirectory] });
  } catch {
    return fallbackTypeScriptPath;
  }
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
