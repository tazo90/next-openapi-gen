import { describe, expect, it } from "vitest";

describe("openapi-framework-astro package entrypoint", () => {
  it("re-exports an Astro integration that injects the Vite plugin", async () => {
    const {
      createAstroFrameworkSource,
      createAstroGenerationAdapters,
      createAstroOpenApiIntegration,
    } = await import("../../../../packages/openapi-framework-astro/src/index.ts");
    const adapters = createAstroGenerationAdapters();
    const integration = createAstroOpenApiIntegration({ configPath: "openapi-gen.config.ts" });
    const updates: unknown[] = [];

    expect(adapters.createFrameworkSource).toBe(createAstroFrameworkSource);
    expect(integration.name).toBe("next-openapi-gen");
    integration.hooks["astro:config:setup"]({
      updateConfig: (config) => {
        updates.push(config);
      },
    });
    expect(updates).toEqual([
      expect.objectContaining({
        vite: expect.objectContaining({
          plugins: [expect.objectContaining({ name: "next-openapi-gen" })],
        }),
      }),
    ]);
  });
});
