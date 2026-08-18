import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const { generateProject } = vi.hoisted(() => ({
  generateProject: vi.fn<MockFn>(() => Promise.resolve()),
}));

vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateProject,
}));

describe("openapi-framework-express package entrypoint", () => {
  it("re-exports generateExpressOpenApi", async () => {
    const {
      createExpressFrameworkSource,
      createExpressGenerationAdapters,
      generateExpressOpenApi,
    } = await import("../../../../packages/openapi-framework-express/src/index.ts");
    const adapters = createExpressGenerationAdapters();

    expect(adapters.createFrameworkSource).toBe(createExpressFrameworkSource);
    await generateExpressOpenApi({ configPath: "openapi-gen.config.ts" });
    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
      }),
    );
  });
});
