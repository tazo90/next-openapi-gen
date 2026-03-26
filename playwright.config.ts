import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3100";

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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "pnpm --dir apps/next-app-zod exec next-openapi-gen generate && pnpm --dir apps/next-app-zod exec next build && pnpm --dir apps/next-app-zod exec next start --hostname localhost --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
