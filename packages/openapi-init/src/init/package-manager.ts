import path from "node:path";
import fs from "node:fs";

import fse from "fs-extra";

export type PackageManager = "npm" | "pnpm" | "yarn";

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

export async function getPackageManager(): Promise<PackageManager> {
  let currentDir = process.cwd();

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          packageManager?: string;
        };
        const packageManager = packageJson.packageManager?.split("@")[0];

        if (packageManager === "pnpm" || packageManager === "yarn" || packageManager === "npm") {
          return packageManager;
        }
      } catch {
        // Ignore invalid package.json files while detecting the package manager.
      }
    }

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

  return "pnpm";
}
