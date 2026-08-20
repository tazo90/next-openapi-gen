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
      openapi: "3.3-preview",
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
    });

    expect(config.openapiVersion).toBe("3.3-preview");
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
    });

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
    });

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
    });

    expect(config.framework).toEqual({
      kind: FrameworkKind.ReactRouter,
      modulePath: undefined,
    });
  });

  it("normalizes the new file-based and call-expression framework kinds", () => {
    expect(
      normalizeOpenApiConfig({
        info: { title: "Fixture", version: "1.0.0" },
        framework: { kind: "remix" },
      }).framework.kind,
    ).toBe(FrameworkKind.Remix);
    expect(
      normalizeOpenApiConfig({
        info: { title: "Fixture", version: "1.0.0" },
        framework: { kind: FrameworkKind.Hono, adapterPath: "./src/index.ts" },
      }).framework,
    ).toEqual({
      kind: FrameworkKind.Hono,
      adapterPath: "./src/index.ts",
      modulePath: "./src/index.ts",
    });
  });

  it("throws for unknown framework kinds instead of falling back to Next.js", () => {
    expect(() =>
      normalizeOpenApiConfig({
        info: { title: "Fixture", version: "1.0.0" },
        framework: { kind: "fastify" as never },
      }),
    ).toThrow(/Unknown framework kind "fastify"/);
  });

  it("infers OpenAPI versions from the template version string", () => {
    expect(
      normalizeOpenApiConfig({
        openapi: "3.1.0",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      }).openapiVersion,
    ).toBe("3.1");

    expect(
      normalizeOpenApiConfig({
        openapi: "3.3-preview",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      }).openapiVersion,
    ).toBe("3.3-preview");

    expect(
      normalizeOpenApiConfig({
        openapi: "3.3.0-preview",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      }).openapiVersion,
    ).toBe("3.3-preview");
  });

  it("does not treat OpenAPI 4.0 as a supported version", () => {
    expect(
      normalizeOpenApiConfig({
        openapi: "4.0.0",
        info: { title: "Fixture", version: "1.0.0", description: "Fixture" },
      }).openapiVersion,
    ).toBe("3.2");
  });

  it("defaults config-style inputs without an explicit openapi version", () => {
    const config = normalizeOpenApiConfig({
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
    });

    expect(config.openapiVersion).toBe("3.0");
  });

  it("defaults cache to true and honors explicit overrides", () => {
    expect(
      normalizeOpenApiConfig({
        info: { title: "Fixture", version: "1.0.0" },
      }).cache,
    ).toBe(true);

    expect(
      normalizeOpenApiConfig({
        info: { title: "Fixture", version: "1.0.0" },
        cache: false,
      }).cache,
    ).toBe(false);
  });

  it("keeps optional arazzo and overlay config and does not treat 3.3 as a version", () => {
    const config = normalizeOpenApiConfig({
      openapi: "3.3.0",
      info: { title: "Fixture", version: "1.0.0" },
      arazzo: { version: "1.1.0", files: ["./arazzo/**/*.yaml"] },
      overlay: { version: "1.1.0", apply: ["./overlays/public.overlay.yaml"] },
    });

    expect(config.openapiVersion).toBe("3.2");
    expect(config.arazzo).toEqual({ version: "1.1.0", files: ["./arazzo/**/*.yaml"] });
    expect(config.overlay).toEqual({
      version: "1.1.0",
      apply: ["./overlays/public.overlay.yaml"],
    });
  });
});
