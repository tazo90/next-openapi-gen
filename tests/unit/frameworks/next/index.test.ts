import { describe, expect, it } from "vitest";

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
});
