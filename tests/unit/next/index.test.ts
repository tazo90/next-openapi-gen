import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const { generateProject } = vi.hoisted(() => ({
  generateProject: vi.fn<MockFn>(),
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
      configPath: "openapi-gen.config.ts",
    });

    expect(adapter.name).toBe("next-openapi-gen");

    await adapter.onBuildComplete?.();

    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
      }),
    );
  });

  it("adds a generated adapter path from withNextOpenApi", () => {
    const config = { reactStrictMode: true };
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "next-openapi-gen-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    try {
      const nextConfig = withNextOpenApi(config, {
        configPath: "./openapi-gen.config.ts",
      });

      expect(nextConfig).toMatchObject({
        reactStrictMode: true,
        adapterPath: path.join(tempDir, ".openapi-gen", "next-openapi.adapter.mjs"),
      });
      expect(fs.readFileSync(nextConfig.adapterPath as string, "utf8")).toContain(
        'createNextOpenApiAdapter({"configPath":"./openapi-gen.config.ts"})',
      );
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
