import { globSync } from "node:fs";
import path from "node:path";

export function expandFileGlobs(patterns: string[], cwd: string): string[] {
  const files = new Set<string>();

  for (const pattern of patterns) {
    const resolvedPattern = path.isAbsolute(pattern) ? pattern : pattern.replace(/^\.\//, "");
    const matches = globSync(resolvedPattern, { cwd });
    for (const match of matches) {
      files.add(path.resolve(cwd, match));
    }
  }

  return [...files].toSorted((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}
