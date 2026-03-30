import { describe, expect, it } from "vitest";

describe("openapi-framework-next package entrypoint", () => {
  it("re-exports the next generation helpers", { timeout: 20_000 }, async () => {
    const { createNextFrameworkSource, createNextGenerationAdapters, emitNextDocsArtifact } =
      await import("../../../../packages/openapi-framework-next/src/index.ts");
    const adapters = createNextGenerationAdapters();

    expect(adapters.createFrameworkSource).toBe(createNextFrameworkSource);
    expect(adapters.emitDocsArtifact).toBe(emitNextDocsArtifact);
  });
});
