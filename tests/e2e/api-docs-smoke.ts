import { access } from "node:fs/promises";
import path from "node:path";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { type E2EAppConfig } from "./apps";

type OpenApiDocument = {
  info?: {
    title?: string;
  };
  paths?: Record<string, unknown>;
};

async function expectFileToExist(relativePath: string) {
  await access(path.join(process.cwd(), relativePath));
}

function createDocsPathPattern(docsPath: string) {
  return new RegExp(`${docsPath.replace("/", "\\/")}(?:#.*)?$`);
}

export async function runApiDocsSmokeTest(options: {
  app: E2EAppConfig;
  page: Page;
  request: APIRequestContext;
}) {
  const { app, page, request } = options;

  await expectFileToExist(app.openApiFile);

  const openApiResponse = await request.get("/openapi.json");

  await expect(openApiResponse).toBeOK();

  const openApiDocument = (await openApiResponse.json()) as OpenApiDocument;

  expect(openApiDocument.info?.title).toBe(app.title);

  for (const openApiPath of app.openApiPaths) {
    expect(openApiDocument.paths).toHaveProperty(openApiPath);
  }

  await page.goto(app.docsPath);
  await expect(page).toHaveURL(createDocsPathPattern(app.docsPath));

  if (app.docsSelector) {
    await expect(page.locator(app.docsSelector)).toBeVisible();
  }

  const body = page.locator("body");

  for (const text of app.docsText) {
    await expect(body).toContainText(text);
  }
}
