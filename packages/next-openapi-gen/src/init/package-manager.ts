import path from "node:path";
import fs from "node:fs";

import fse from "fs-extra";

export async function hasDependency(packageName: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = await fse.readJson(packageJsonPath);
    return Boolean(
      packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName],
    );
  } catch {
    return false;
  }
}

export async function getPackageManager() {
  let currentDir = process.cwd();

  while (true) {
    if (fs.existsSync(path.join(currentDir, "yarn.lock"))) {
      return "yarn";
    }

    if (fs.existsSync(path.join(currentDir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return "npm";
}
