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

describe("openapi-framework-hono package entrypoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("re-exports helpers and a Vite plugin", async () => {
    const { createHonoFrameworkSource, createHonoGenerationAdapters, createHonoOpenApiPlugin } =
      await import("../../../../packages/openapi-framework-hono/src/index.ts");
    const adapters = createHonoGenerationAdapters();
    const plugin = createHonoOpenApiPlugin({ watch: false });

    expect(adapters.createFrameworkSource).toBe(createHonoFrameworkSource);
    await plugin.buildStart();
    await plugin.configureServer();
    plugin.closeBundle();
    expect(generateProject).toHaveBeenCalled();
    expect(watchProject).not.toHaveBeenCalled();
  });
});
