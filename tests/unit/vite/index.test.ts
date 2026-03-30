import { afterEach, describe, expect, it, vi } from "vitest";

const { generateProject, stopWatching, watchProject } = vi.hoisted(() => ({
  generateProject: vi.fn(),
  stopWatching: vi.fn(),
  watchProject: vi.fn(() => Promise.resolve(stopWatching)),
}));

vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateProject,
}));
vi.mock("@workspace/openapi-core/core/watch.js", () => ({
  watchProject,
}));

import { createViteOpenApiPlugin } from "../../../packages/next-openapi-gen/src/vite/index.ts";

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

    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "next-openapi.config.ts",
      }),
    );
    expect(watchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "next-openapi.config.ts",
      }),
    );

    plugin.closeBundle();

    expect(stopWatching).toHaveBeenCalledTimes(1);
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
