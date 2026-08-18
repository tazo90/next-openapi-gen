import { afterEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const { generateProject, stopWatching, watchProject } = vi.hoisted(() => ({
  generateProject: vi.fn<MockFn>(),
  stopWatching: vi.fn<MockFn>(),
  watchProject: vi.fn<MockFn>(() => Promise.resolve(stopWatching)),
}));

vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateProject,
}));
vi.mock("@workspace/openapi-core/core/watch.js", () => ({
  watchProject,
}));

describe("openapi-framework-sveltekit package entrypoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("re-exports helpers and a Vite plugin", async () => {
    const {
      createSvelteKitFrameworkSource,
      createSvelteKitGenerationAdapters,
      createSvelteKitOpenApiPlugin,
    } = await import("../../../../packages/openapi-framework-sveltekit/src/index.ts");
    const adapters = createSvelteKitGenerationAdapters();
    const plugin = createSvelteKitOpenApiPlugin();

    expect(adapters.createFrameworkSource).toBe(createSvelteKitFrameworkSource);
    await plugin.buildStart();
    await plugin.configureServer();
    plugin.closeBundle();
    expect(generateProject).toHaveBeenCalled();
    expect(watchProject).toHaveBeenCalled();
  });
});
