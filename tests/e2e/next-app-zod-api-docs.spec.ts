import { expect, test } from "@playwright/test";

test.describe("next-app-zod api docs", () => {
  test("serves the generated spec and renders api-docs", async ({ page, request }) => {
    const openApiResponse = await request.get("/openapi.json");

    await expect(openApiResponse).toBeOK();

    const openApiDocument = await openApiResponse.json();

    expect(openApiDocument.info.title).toBe("API Documentation");
    expect(openApiDocument.paths).toHaveProperty("/users");
    expect(openApiDocument.paths).toHaveProperty("/orders");

    await page.goto("/api-docs");
    await expect(page).toHaveURL(/\/api-docs(?:#.*)?$/);
    await expect(page.locator("body")).toContainText("API Documentation");
    await expect(page.locator("body")).toContainText("Users");
    await expect(page.locator("body")).toContainText("Orders");
  });
});
