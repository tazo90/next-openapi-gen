import { defineConfig, devices } from "@playwright/test";

import { getE2EAppConfig } from "./tests/e2e/apps";

const app = getE2EAppConfig();
const baseURL = `http://localhost:${app.port}`;
const readyURL = `${baseURL}${app.docsPath}`;

function createAssertOpenApiFileCommand() {
  return `node -e 'if (!require("node:fs").existsSync(${JSON.stringify(app.openApiFile)})) { throw new Error(${JSON.stringify(`Expected generated OpenAPI file at ${app.openApiFile}.`)}); }'`;
}

function createWebServerCommand() {
  const deleteOpenApiFileCommand = `node -e 'require("node:fs").rmSync(${JSON.stringify(app.openApiFile)}, { force: true });'`;
  const commands = [deleteOpenApiFileCommand];

  if (app.generateCommand) {
    commands.push(app.generateCommand);
  }

  if ((app.openApiReadyStage ?? "generate") === "generate") {
    commands.push(createAssertOpenApiFileCommand());
  }

  commands.push(app.buildCommand);

  if ((app.openApiReadyStage ?? "generate") === "build") {
    commands.push(createAssertOpenApiFileCommand());
  }

  commands.push(app.startCommand);

  return commands.join(" && ");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: `${app.name}-chromium`,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: createWebServerCommand(),
    url: readyURL,
    reuseExistingServer: false,
  },
});
