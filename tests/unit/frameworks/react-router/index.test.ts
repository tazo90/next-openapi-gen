import { describe, expect, it } from "vitest";

describe("openapi-framework-react-router package entrypoint", () => {
  it("re-exports the React Router helpers", async () => {
    const { createReactRouterFrameworkSource, createReactRouterGenerationAdapters } =
      await import("../../../../packages/openapi-framework-react-router/src/index.ts");
    const adapters = createReactRouterGenerationAdapters();

    expect(adapters.createFrameworkSource).toBe(createReactRouterFrameworkSource);
  });
});
