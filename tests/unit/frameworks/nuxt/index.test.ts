import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const { generateProject } = vi.hoisted(() => ({
  generateProject: vi.fn<MockFn>(),
}));

vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateProject,
}));

describe("openapi-framework-nuxt package entrypoint", () => {
  it("re-exports a Nuxt module that generates on nitro:build:before", async () => {
    const { createNuxtFrameworkSource, createNuxtGenerationAdapters, createNuxtOpenApiModule } =
      await import("../../../../packages/openapi-framework-nuxt/src/index.ts");
    const adapters = createNuxtGenerationAdapters();
    const nuxtModule = createNuxtOpenApiModule({ configPath: "openapi-gen.config.ts" });
    let beforeNitro: (() => void | Promise<void>) | undefined;
    const hook = vi.fn<(name: string, fn: () => void | Promise<void>) => void>((name, fn) => {
      if (name === "nitro:build:before") {
        beforeNitro = fn;
      }
    });

    expect(adapters.createFrameworkSource).toBe(createNuxtFrameworkSource);
    expect(nuxtModule.meta.name).toBe("next-openapi-gen");
    nuxtModule.setup({}, { hooks: { hook } });
    await beforeNitro?.();
    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
      }),
    );
  });
});
