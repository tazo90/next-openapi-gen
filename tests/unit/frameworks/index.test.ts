import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";

const { createNextFrameworkSource } = vi.hoisted(() => ({
  createNextFrameworkSource: vi.fn<MockFn>(() => ({ name: "next-source" })),
}));

vi.mock("@workspace/openapi-framework-next/frameworks/next/source.js", () => ({
  createNextFrameworkSource,
}));

import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";

describe("createDefaultGenerationAdapters", () => {
  it("delegates next configs to the Next source", () => {
    const adapters = createDefaultGenerationAdapters();
    const config = {
      framework: {
        kind: FrameworkKind.Nextjs,
        router: "app",
      },
    };

    expect(adapters.createFrameworkSource(config as never)).toEqual({ name: "next-source" });
    expect(createNextFrameworkSource).toHaveBeenCalledWith(config, undefined);
  });

  it("supports tanstack and react-router sources", () => {
    const adapters = createDefaultGenerationAdapters();

    expect(
      adapters.createFrameworkSource({
        apiDir: "./src/routes/api",
        schemaDir: "./src",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        schemaType: "typescript",
        schemaBackends: ["typescript"],
        schemaFiles: [],
        framework: {
          kind: FrameworkKind.Tanstack,
        },
        next: {},
        diagnostics: { enabled: true },
        routerType: "app",
        openapiVersion: "3.0",
        debug: false,
      } as never),
    ).toBeTruthy();

    expect(
      adapters.createFrameworkSource({
        apiDir: "./app/routes",
        schemaDir: "./app",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        schemaType: "typescript",
        schemaBackends: ["typescript"],
        schemaFiles: [],
        framework: {
          kind: FrameworkKind.ReactRouter,
        },
        next: {},
        diagnostics: { enabled: true },
        routerType: "app",
        openapiVersion: "3.0",
        debug: false,
      } as never),
    ).toBeTruthy();
  });
});
