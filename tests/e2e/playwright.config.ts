import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const appRouterExampleRoot = fileURLToPath(
  new URL('../../examples/next15-app-zod/', import.meta.url),
);
const pagesRouterExampleRoot = fileURLToPath(
  new URL('../../examples/next15-pages-router/', import.meta.url),
);

export default defineConfig({
  testDir: './',
  fullyParallel: false,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  reporter: isCI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: '../../test-results/playwright',
  projects: [
    {
      name: 'app-router',
      testMatch: /app-router\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3100',
      },
    },
    {
      name: 'pages-router',
      testMatch: /pages-router\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3101',
      },
    },
  ],
  webServer: [
    {
      cwd: appRouterExampleRoot,
      command:
        'npm install && node ../../dist/index.js generate -t next.openapi.json && npm run dev -- --hostname 127.0.0.1 --port 3100',
      url: 'http://127.0.0.1:3100/openapi.json',
      reuseExistingServer: !isCI,
      timeout: 240000,
    },
    {
      cwd: pagesRouterExampleRoot,
      command:
        'npm install && node ../../dist/index.js generate -t next.openapi.json && npm run dev -- --hostname 127.0.0.1 --port 3101',
      url: 'http://127.0.0.1:3101/openapi.json',
      reuseExistingServer: !isCI,
      timeout: 240000,
    },
  ],
});
