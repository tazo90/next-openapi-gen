import path from "path";
import fse from "fs-extra";
import fs from "fs";
import ora from "ora";
import { exec } from "child_process";
import util from "util";

import openapiTemplate from "../openapi-template.js";
import { scalarDeps, scalarDevDeps, ScalarUI } from "../components/scalar.js";
import { swaggerDeps, swaggerDevDeps, SwaggerUI } from "../components/swagger.js";
import { redocDeps, redocDevDeps, RedocUI } from "../components/redoc.js";
import { stoplightDeps, stoplightDevDeps, StoplightUI } from "../components/stoplight.js";
import { rapidocDeps, rapidocDevDeps, RapidocUI } from "../components/rapidoc.js";

const execPromise = util.promisify(exec);

const spinner = ora("Initializing project with OpenAPI template...\n");

async function hasDependency(packageName: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = await fse.readJson(packageJsonPath);
    return !!(packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName]);
  } catch {
    return false;
  }
}

const getPackageManager = async () => {
  let currentDir = process.cwd();

  while (true) {
    // Check for Yarn lock file
    if (fs.existsSync(path.join(currentDir, "yarn.lock"))) {
      return "yarn";
    }
    // Check for PNPM lock file
    if (fs.existsSync(path.join(currentDir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    // If we're at the root directory, break the loop
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // We've reached the root
    }
    currentDir = parentDir; // Move up one directory
  }

  // Default to npm if no lock files are found
  return "npm";
};

function getDocsPage(ui: string, outputFile: string) {
  let DocsComponent = ScalarUI;

  if (ui === "swagger") {
    DocsComponent = SwaggerUI;
  } else if (ui === "redoc") {
    DocsComponent = RedocUI;
  } else if (ui === "stoplight") {
    DocsComponent = StoplightUI;
  } else if (ui === "rapidoc") {
    DocsComponent = RapidocUI;
  }

  return DocsComponent(outputFile);
}

function getDocsPageInstallFlags(ui: string, packageManager: string) {
  let installFlags = "";
  if (ui === "swagger") {
    // @temp: swagger-ui-react does not support React 19 now.
    if (packageManager === "pnpm") {
      installFlags = "--no-strict-peer-dependencies";
    } else if (packageManager === "yarn") {
      installFlags = ""; // flag for legacy peer deps is not needed for yarn
    } else {
      installFlags = "--legacy-peer-deps";
    }
  }

  return installFlags;
}

function getDocsPageDependencies(ui: string) {
  let deps = [];

  if (ui === "scalar") {
    deps = scalarDeps;
  } else if (ui === "swagger") {
    deps = swaggerDeps;
  } else if (ui === "redoc") {
    deps = redocDeps;
  } else if (ui === "stoplight") {
    deps = stoplightDeps;
  } else if (ui === "rapidoc") {
    deps = rapidocDeps;
  }

  return deps.join(" ");
}

function getDocsPageDevDependencies(ui: string) {
  let devDeps = [];

  if (ui === "scalar") {
    devDeps = scalarDevDeps;
  } else if (ui === "swagger") {
    devDeps = swaggerDevDeps;
  } else if (ui === "redoc") {
    devDeps = redocDevDeps;
  } else if (ui === "stoplight") {
    devDeps = stoplightDevDeps;
  } else if (ui === "rapidoc") {
    devDeps = rapidocDevDeps;
  }

  return devDeps.join(" ");
}

async function createDocsPage(ui: string, outputFile: string) {
  if (ui === "none") {
    return;
  }

  const paths = ["app", "api-docs"];
  const srcPath = path.join(process.cwd(), "src");

  if (fs.existsSync(srcPath)) {
    paths.unshift("src");
  }

  const docsDir = path.join(process.cwd(), ...paths);
  await fs.promises.mkdir(docsDir, { recursive: true });

  const docsPage = getDocsPage(ui, outputFile);

  const componentPath = path.join(docsDir, "page.tsx");
  await fs.promises.writeFile(componentPath, docsPage.trim());
  spinner.succeed(`Created ${paths.join("/")}/page.tsx for ${ui}.`);
}

async function installDependencies(ui: string, schema: string) {
  const packageManager = await getPackageManager();
  const installCmd = `${packageManager} ${
    packageManager === "npm" ? "install" : "add"
  }`;

  // Install UI dependencies
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

  // Install schema dependencies
  if (schema === "zod" && !(await hasDependency("zod"))) {
    spinner.succeed(`Installing zod...`);
    await execPromise(`${installCmd} zod`);
    spinner.succeed(`Successfully installed zod.`);
  } else if (schema === "typescript" && !(await hasDependency("typescript"))) {
    const devFlag = packageManager === "npm" ? "--save-dev" : "-D";
    spinner.succeed(`Installing typescript...`);
    await execPromise(`${installCmd} ${devFlag} typescript`);
    spinner.succeed(`Successfully installed typescript.`);
  }
}

function extendOpenApiTemplate(spec, options) {
  spec.ui = options.ui ?? spec.ui;
  spec.docsUrl = options.docsUrl ?? spec.docsUrl;
  spec.schemaType = options.schema ?? spec.schemaType;
}

function getOutputPath(output?: string) {
  if (output) {
    return path.isAbsolute(output) ? output : path.join(process.cwd(), output);
  }

  return path.join(process.cwd(), "next.openapi.json");
}

export async function init(options) {
  const { ui, output, schema } = options;

  spinner.start();

  try {
    const outputPath = getOutputPath(output);
    const template = { ...openapiTemplate };

    extendOpenApiTemplate(template, options);

    await fse.writeJson(outputPath, template, { spaces: 2 });
    spinner.succeed(`Created OpenAPI template in ${outputPath}`);

    createDocsPage(ui, template.outputFile);
    installDependencies(ui, schema);
  } catch (error) {
    spinner.fail(`Failed to initialize project: ${error.message}`);
  }
}
