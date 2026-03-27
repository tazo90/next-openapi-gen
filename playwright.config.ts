import { defineConfig, devices } from "@playwright/test";

import { getE2EAppConfig } from "./tests/e2e/apps";

const app = getE2EAppConfig();
const baseURL = `http://localhost:${app.port}`;

function createWebServerCommand() {
  const deleteOpenApiFileCommand = `node -e 'require("node:fs").rmSync(${JSON.stringify(app.openApiFile)}, { force: true });'`;
  const generateOpenApiCommand = `pnpm --dir ${app.appDir} exec next-openapi-gen generate`;
  const assertOpenApiFileCommand = `node -e 'if (!require("node:fs").existsSync(${JSON.stringify(app.openApiFile)})) { throw new Error(${JSON.stringify(`Expected generated OpenAPI file at ${app.openApiFile}.`)}); }'`;
  const buildAppCommand = `pnpm --dir ${app.appDir} exec next build`;
  const startAppCommand = `pnpm --dir ${app.appDir} exec next start --hostname localhost --port ${app.port}`;

  return [
    deleteOpenApiFileCommand,
    generateOpenApiCommand,
    assertOpenApiFileCommand,
    buildAppCommand,
    startAppCommand,
  ].join(" && ");
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
    url: baseURL,
    reuseExistingServer: false,
  },
});
