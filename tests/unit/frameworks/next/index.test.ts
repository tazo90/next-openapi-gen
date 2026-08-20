import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createNextFrameworkSource,
  createNextGenerationAdapters,
  createNextOpenApiAdapter,
  emitNextDocsArtifact,
  withNextOpenApi,
} from "../../../../packages/openapi-framework-next/src/index.ts";

describe("openapi-framework-next package entrypoint", () => {
  it("re-exports the next generation helpers", () => {
    const adapters = createNextGenerationAdapters();

    expect(adapters.createFrameworkSource).toBe(createNextFrameworkSource);
    expect(adapters.emitDocsArtifact).toBe(emitNextDocsArtifact);
    expect(typeof createNextOpenApiAdapter).toBe("function");
    expect(typeof withNextOpenApi).toBe("function");
  });

  it("leaves an existing adapterPath in place", () => {
    const nextConfig = { adapterPath: "./custom-adapter.mjs" };
    expect(withNextOpenApi(nextConfig)).toBe(nextConfig);
  });

  it("leaves an experimental adapterPath in place", () => {
    const nextConfig = { experimental: { adapterPath: "./legacy-adapter.mjs" } };
    expect(withNextOpenApi(nextConfig)).toBe(nextConfig);
  });

  it("writes a generated adapter module when none is configured", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-framework-next-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    try {
      const nextConfig = withNextOpenApi(
        { reactStrictMode: true, experimental: { turbo: true } },
        { configPath: "./openapi-gen.config.ts" },
      );

      expect(nextConfig.adapterPath).toBe(
        path.join(tempDir, ".openapi-gen", "next-openapi.adapter.mjs"),
      );
      expect(fs.readFileSync(nextConfig.adapterPath as string, "utf8")).toContain(
        "createNextOpenApiAdapter",
      );
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
