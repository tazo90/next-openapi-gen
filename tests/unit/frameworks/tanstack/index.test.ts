import { describe, expect, it } from "vitest";

describe("openapi-framework-tanstack package entrypoint", () => {
  it("re-exports the TanStack helpers", async () => {
    const { createTanStackFrameworkSource, createTanStackGenerationAdapters } =
      await import("../../../../packages/openapi-framework-tanstack/src/index.ts");
    const adapters = createTanStackGenerationAdapters();

    expect(adapters.createFrameworkSource).toBe(createTanStackFrameworkSource);
  });
});
