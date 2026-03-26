import { exec } from "node:child_process";
import util from "node:util";

import {
  getDocsPageDependencies,
  getDocsPageDevDependencies,
  getDocsPageInstallFlags,
} from "./ui-manifest.js";
import { getPackageManager, hasDependency } from "./package-manager.js";

const execPromise = util.promisify(exec);

type SpinnerLike = {
  succeed(message: string): void;
};

export async function installDependencies(
  ui: string,
  schema: string | string[],
  spinner: SpinnerLike,
): Promise<void> {
  const packageManager = await getPackageManager();
  const installCmd = `${packageManager} ${packageManager === "npm" ? "install" : "add"}`;

  if (ui !== "none") {
    const deps = getDocsPageDependencies(ui);
    const devDeps = getDocsPageDevDependencies(ui);
    const flags = getDocsPageInstallFlags(ui, packageManager);

    if (deps) {
      spinner.succeed(`Installing ${deps} dependencies...`);
      await execPromise(`${installCmd} ${deps} ${flags}`);
      spinner.succeed(`Successfully installed ${deps}.`);
    }

    if (devDeps) {
      const devFlag = packageManager === "npm" ? "--save-dev" : "-D";
      spinner.succeed(`Installing ${devDeps} dev dependencies...`);
      await execPromise(`${installCmd} ${devFlag} ${devDeps} ${flags}`);
      spinner.succeed(`Successfully installed ${devDeps}.`);
    }
  }

  const schemaTypes = Array.isArray(schema) ? schema : [schema];

  for (const schemaType of schemaTypes) {
    if (schemaType === "zod" && !(await hasDependency("zod"))) {
      spinner.succeed("Installing zod...");
      await execPromise(`${installCmd} zod`);
      spinner.succeed("Successfully installed zod.");
    } else if (schemaType === "typescript" && !(await hasDependency("typescript"))) {
      const devFlag = packageManager === "npm" ? "--save-dev" : "-D";
      spinner.succeed("Installing typescript...");
      await execPromise(`${installCmd} ${devFlag} typescript`);
      spinner.succeed("Successfully installed typescript.");
    }
  }
}
