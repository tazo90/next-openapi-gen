import { describe, expect, it, vi } from "vitest";

const { generateProject } = vi.hoisted(() => ({
  generateProject: vi.fn(),
}));

vi.mock("@workspace/openapi-core/core/generate.js", () => ({
  generateProject,
}));

import {
  createNextOpenApiAdapter,
  withNextOpenApi,
} from "../../../packages/next-openapi-gen/src/next/index.ts";

describe("next integration", () => {
  it("creates a build adapter that runs generation on build complete", async () => {
    const adapter = createNextOpenApiAdapter({
      configPath: "next-openapi.config.ts",
    });

    expect(adapter.name).toBe("next-openapi-gen");

    await adapter.onBuildComplete?.();

    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "next-openapi.config.ts",
      }),
    );
  });

  it("returns the original config from withNextOpenApi", () => {
    const config = { reactStrictMode: true };
    expect(withNextOpenApi(config)).toBe(config);
  });
});
