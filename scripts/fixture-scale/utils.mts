import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeTextFile(filePath: string, contents: string, dryRun: boolean): void {
  if (dryRun) {
    return;
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

export function writeJsonFile(filePath: string, value: unknown, dryRun: boolean): void {
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`, dryRun);
}

export function removeDirIfExists(dirPath: string, dryRun: boolean): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  if (dryRun) {
    return;
  }
  fs.rmSync(dirPath, { recursive: true, force: true });
}

export function copyDirectory(sourceDir: string, targetDir: string, dryRun: boolean): void {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing source directory: ${sourceDir}`);
  }
  if (dryRun) {
    return;
  }
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, dryRun);
      continue;
    }
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

export function listFilesRecursive(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}
