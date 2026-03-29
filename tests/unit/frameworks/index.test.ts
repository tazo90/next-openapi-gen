import { describe, expect, it, vi } from "vitest";

import { FrameworkKind } from "@next-openapi-gen/shared/types.js";

const { createNextFrameworkSource } = vi.hoisted(() => ({
  createNextFrameworkSource: vi.fn(() => ({ name: "next-source" })),
}));

vi.mock("@next-openapi-gen/frameworks/next/source.js", () => ({
  createNextFrameworkSource,
}));

import { createFrameworkSource } from "@next-openapi-gen/frameworks/index.js";

describe("createFrameworkSource", () => {
  it("delegates next configs to the Next source", () => {
    const config = {
      framework: {
        kind: FrameworkKind.Nextjs,
        router: "app",
      },
    };

    expect(createFrameworkSource(config as never)).toEqual({ name: "next-source" });
    expect(createNextFrameworkSource).toHaveBeenCalledWith(config);
  });

  it("supports tanstack and react-router sources", () => {
    expect(
      createFrameworkSource({
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
      createFrameworkSource({
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
