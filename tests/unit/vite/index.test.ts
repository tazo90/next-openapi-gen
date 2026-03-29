import { afterEach, describe, expect, it, vi } from "vitest";

const { generateProject, watchProject } = vi.hoisted(() => ({
  generateProject: vi.fn(),
  watchProject: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock("@next-openapi-gen/core/generate.js", () => ({
  generateProject,
}));
vi.mock("@next-openapi-gen/core/watch.js", () => ({
  watchProject,
}));

import { createViteOpenApiPlugin } from "@next-openapi-gen/vite/index.js";

describe("createViteOpenApiPlugin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates on build and starts watching in dev mode", async () => {
    const plugin = createViteOpenApiPlugin({
      configPath: "next-openapi.config.ts",
    });

    await plugin.buildStart();
    await plugin.configureServer();

    expect(generateProject).toHaveBeenCalledWith({
      configPath: "next-openapi.config.ts",
    });
    expect(watchProject).toHaveBeenCalledWith({
      configPath: "next-openapi.config.ts",
    });
  });

  it("skips watcher setup when watch is disabled", async () => {
    const plugin = createViteOpenApiPlugin({
      configPath: "next-openapi.config.ts",
      watch: false,
    });

    await plugin.configureServer();

    expect(watchProject).toHaveBeenCalledTimes(0);
  });
});
