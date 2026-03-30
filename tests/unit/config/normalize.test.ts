import { describe, expect, it } from "vitest";

import { normalizeOpenApiConfig } from "@workspace/openapi-core/config/normalize.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";

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
      kind: FrameworkKind.Nextjs,
      modulePath: "./adapter.ts",
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
        kind: FrameworkKind.Tanstack,
      },
      schemaType: "typescript",
    } as never);

    expect(config.openapiVersion).toBe("4.0");
    expect(config.framework).toEqual({
      kind: FrameworkKind.Tanstack,
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
        kind: FrameworkKind.Nextjs,
      },
      next: {
        adapterPath: "./custom-adapter.ts",
      },
    } as never);

    expect(config.framework).toEqual({
      kind: FrameworkKind.Nextjs,
      modulePath: "./custom-adapter.ts",
      router: "pages",
      adapterPath: "./custom-adapter.ts",
    });
  });

  it("preserves react-router framework configs and maps legacy adapterPath to modulePath", () => {
    const config = normalizeOpenApiConfig({
      openapi: "3.1.0",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      framework: {
        kind: FrameworkKind.ReactRouter,
        adapterPath: "./framework-source.ts",
      },
    } as never);

    expect(config.framework).toEqual({
      kind: FrameworkKind.ReactRouter,
      adapterPath: "./framework-source.ts",
      modulePath: "./framework-source.ts",
    });
  });

  it("accepts legacy framework string aliases and normalizes them to enum values", () => {
    const config = normalizeOpenApiConfig({
      info: {
        title: "Fixture",
        version: "1.0.0",
      },
      framework: {
        kind: "react-router",
      },
    } as never);

    expect(config.framework).toEqual({
      kind: FrameworkKind.ReactRouter,
      modulePath: undefined,
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
