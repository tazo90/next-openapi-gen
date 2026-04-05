import fs from "fs";
import path from "path";

import { logger } from "../../shared/logger.js";

export const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".turbo", ".cache"]);

export function collectZodRouteFiles(apiDir?: string): string[] {
  const routeFiles: string[] = [];

  if (apiDir) {
    if (fs.existsSync(apiDir)) {
      collectRouteFilesInDirectory(apiDir, routeFiles);
    }

    return routeFiles;
  }

  const possibleApiDirs = [
    path.join(process.cwd(), "src", "app", "api"),
    path.join(process.cwd(), "src", "pages", "api"),
    path.join(process.cwd(), "app", "api"),
    path.join(process.cwd(), "pages", "api"),
  ];

  for (const dir of possibleApiDirs) {
    if (fs.existsSync(dir)) {
      collectRouteFilesInDirectory(dir, routeFiles);
    }
  }

  return routeFiles;
}

export function collectRouteFilesInDirectory(dir: string, routeFiles: string[]): void {
  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        if (!IGNORED_DIRS.has(file)) {
          collectRouteFilesInDirectory(filePath, routeFiles);
        }
      } else if (
        file === "route.ts" ||
        file === "route.tsx" ||
        (file.endsWith(".ts") && file.includes("api"))
      ) {
        routeFiles.push(filePath);
      }
    }
  } catch (error) {
    logger.error(`Error scanning directory ${dir} for route files: ${error}`);
  }
}

export function processZodSchemaFilesInDirectory(
  dir: string,
  onFile: (filePath: string) => void,
): void {
  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        if (!IGNORED_DIRS.has(file)) {
          processZodSchemaFilesInDirectory(filePath, onFile);
        }
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        onFile(filePath);
      }
    }
  } catch (error) {
    logger.error(`Error scanning directory ${dir}: ${error}`);
  }
}
