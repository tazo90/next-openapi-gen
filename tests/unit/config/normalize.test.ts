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

  it("preserves explicit framework configs and ignores legacy openapiVersion overrides", () => {
    const config = normalizeOpenApiConfig({
      openapi: "4.1.0",
      openapiVersion: "3.1",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      framework: {
        kind: "tanstack",
      },
      schemaType: "typescript",
    } as never);

    expect(config.openapiVersion).toBe("4.0");
    expect(config.framework).toEqual({
      kind: "tanstack",
    });
  });

  it("fills missing next framework fields from router and next adapter settings", () => {
    const config = normalizeOpenApiConfig({
      openapi: "3.0.0",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      routerType: "pages",
      framework: {
        kind: "next",
      },
      next: {
        adapterPath: "./custom-adapter.ts",
      },
    } as never);

    expect(config.framework).toEqual({
      kind: "next",
      router: "pages",
      adapterPath: "./custom-adapter.ts",
    });
  });

  it("infers OpenAPI versions from the template version string", () => {
    expect(
      normalizeOpenApiConfig({
        openapi: "3.1.0",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      } as never).openapiVersion,
    ).toBe("3.1");

    expect(
      normalizeOpenApiConfig({
        openapi: "4.0.0",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      } as never).openapiVersion,
    ).toBe("4.0");
  });

  it("defaults config-style inputs without an explicit openapi version", () => {
    const config = normalizeOpenApiConfig({
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
    } as never);

    expect(config.openapiVersion).toBe("3.0");
  });
});
