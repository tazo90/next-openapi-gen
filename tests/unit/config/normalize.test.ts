import { describe, expect, it } from "vitest";

import { normalizeOpenApiConfig } from "@next-openapi-gen/config/normalize.js";

describe("normalizeOpenApiConfig", () => {
  it("derives framework, version, schema backends, and next adapter settings", () => {
    const config = normalizeOpenApiConfig({
      openapi: "3.2.0",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      apiDir: "./src/app/api",
      schemaDir: "./src",
      schemaType: ["zod", "typescript"],
      outputDir: "./public",
      outputFile: "openapi.json",
      docsUrl: "api/docs",
      ui: "scalar",
      includeOpenApiRoutes: false,
      debug: false,
      next: {
        adapterPath: "./adapter.ts",
      },
    });

    expect(config.openapiVersion).toBe("3.2");
    expect(config.framework).toEqual({
      kind: "next",
      router: "app",
      adapterPath: "./adapter.ts",
    });
    expect(config.schemaBackends).toEqual(["zod", "typescript"]);
    expect(config.docsUrl).toBe("api/docs");
  });
});
