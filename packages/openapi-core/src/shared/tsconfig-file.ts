import fs from "fs";
import path from "path";

/**
 * Walk from `fromFilePath` toward the filesystem root and return the first
 * `tsconfig.json` that can own a TypeScript program for that file.
 *
 * Solution-style configs (`files: []` plus `references`) are skipped. They are
 * not compilable programs — binding a source file to one yields an empty
 * `fileNames` list, so checker fallbacks resolve every type to `{}`.
 */
export function findTypeScriptConfigFile(fromFilePath: string): string | null {
  let directory = path.dirname(path.resolve(fromFilePath));

  while (true) {
    const configPath = path.join(directory, "tsconfig.json");
    if (fs.existsSync(configPath) && !isSolutionStyleTsConfigFile(configPath)) {
      return configPath;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

function isSolutionStyleTsConfigFile(configPath: string): boolean {
  const config = readJsonObject(configPath);
  if (!config) {
    return false;
  }

  const references = config["references"];
  if (!Array.isArray(references) || references.length === 0) {
    return false;
  }

  const files = config["files"];
  if (!Array.isArray(files) || files.length !== 0) {
    return false;
  }

  const include = config["include"];
  return include === undefined || (Array.isArray(include) && include.length === 0);
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
