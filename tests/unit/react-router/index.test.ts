import { describe, expect, it, vi } from "vitest";

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

import { createReactRouterOpenApiPlugin } from "@next-openapi-gen/react-router/index.js";

describe("createReactRouterOpenApiPlugin", () => {
  it("delegates to the Vite integration surface", async () => {
    const plugin = createReactRouterOpenApiPlugin({
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
});
