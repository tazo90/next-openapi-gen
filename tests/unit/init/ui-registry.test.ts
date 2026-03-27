import fs from "node:fs";

import { describe, expect, it } from "vitest";

import openapiTemplate from "@next-openapi-gen/init/openapi-template.js";
import {
  getDocsPage,
  getDocsPageDependencies,
  getDocsPageDevDependencies,
  getDocsPageInstallFlags,
  getDocsPageTemplatePath,
  UI_REGISTRY,
  UI_TYPES,
  UI_TYPES_WITH_NONE,
} from "@next-openapi-gen/init/ui-registry.js";
import openapiTemplateSource from "../../../packages/next-openapi-gen/src/init/openapi-template.ts";

describe("OpenAPI init defaults", () => {
  it("keeps the default template aligned with the CLI defaults", () => {
    expect(openapiTemplate).toMatchObject({
      openapi: "3.0.0",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      schemaType: "zod",
    });
    expect(openapiTemplateSource).toMatchObject({
      defaultResponseSet: "common",
      responseSets: {
        common: ["400", "500"],
      },
    });
  });
});

describe("UI templates", () => {
  it("ships typed template assets for each built-in UI", () => {
    expect(UI_REGISTRY.scalar.deps).toEqual(["@scalar/api-reference-react", "ajv"]);
    expect(UI_REGISTRY.swagger.deps).toEqual(["swagger-ui", "swagger-ui-react"]);
    expect(UI_REGISTRY.swagger.devDeps).toEqual(["@types/swagger-ui-react"]);
    expect(UI_REGISTRY.redoc.deps).toEqual(["redoc"]);
    expect(UI_REGISTRY.stoplight.deps).toEqual(["@stoplight/elements"]);
    expect(UI_REGISTRY.rapidoc.deps).toEqual(["rapidoc"]);

    expect(UI_REGISTRY.scalar.templateFile).toBe("scalar.tsx");
    expect(UI_REGISTRY.swagger.templateFile).toBe("swagger.tsx");
    expect(UI_REGISTRY.redoc.templateFile).toBe("redoc.tsx");
    expect(UI_REGISTRY.stoplight.templateFile).toBe("stoplight.tsx");
    expect(UI_REGISTRY.rapidoc.templateFile).toBe("rapidoc.tsx");

    for (const uiType of UI_TYPES) {
      const templatePath = getDocsPageTemplatePath(uiType);
      expect(fs.existsSync(templatePath)).toBe(true);
      expect(templatePath.endsWith(".tsx")).toBe(true);
    }
  });
});

describe("UI registry helpers", () => {
  it("exports the supported registry keys", () => {
    expect(UI_TYPES).toEqual(["scalar", "swagger", "redoc", "stoplight", "rapidoc"]);
    expect(UI_TYPES_WITH_NONE).toEqual([...UI_TYPES, "none"]);
    expect(Object.keys(UI_REGISTRY)).toEqual(UI_TYPES);
  });

  it("returns dependency strings for each UI", () => {
    expect(getDocsPageDependencies("scalar")).toBe("@scalar/api-reference-react ajv");
    expect(getDocsPageDependencies("swagger")).toBe("swagger-ui swagger-ui-react");
    expect(getDocsPageDependencies("redoc")).toBe("redoc");
    expect(getDocsPageDependencies("stoplight")).toBe("@stoplight/elements");
    expect(getDocsPageDependencies("rapidoc")).toBe("rapidoc");
  });

  it("returns dev dependency strings for each UI", () => {
    expect(getDocsPageDevDependencies("scalar")).toBe("");
    expect(getDocsPageDevDependencies("swagger")).toBe("@types/swagger-ui-react");
    expect(getDocsPageDevDependencies("redoc")).toBe("");
    expect(getDocsPageDevDependencies("stoplight")).toBe("");
    expect(getDocsPageDevDependencies("rapidoc")).toBe("");
  });

  it("returns package-manager specific install flags for swagger", () => {
    expect(getDocsPageInstallFlags("scalar", "pnpm")).toBe("");
    expect(getDocsPageInstallFlags("swagger", "pnpm")).toBe("--no-strict-peer-dependencies");
    expect(getDocsPageInstallFlags("swagger", "yarn")).toBe("");
    expect(getDocsPageInstallFlags("swagger", "npm")).toBe("--legacy-peer-deps");
    expect(getDocsPageInstallFlags("none", "pnpm")).toBe("");
  });

  it("falls back to the scalar template when the UI type is unknown", () => {
    expect(getDocsPage("unknown", "openapi.json")).toContain("@scalar/api-reference-react");
    expect(getDocsPage("", "openapi.json")).toContain("@scalar/api-reference-react");
  });

  it("renders the original built-in page code through the registry", () => {
    expect(getDocsPage("scalar", "openapi.json")).toContain('url: "/openapi.json"');
    expect(getDocsPage("swagger", "openapi.json")).toContain('<SwaggerUI url="/openapi.json" />');
    expect(getDocsPage("redoc", "openapi.json")).toContain(
      '<RedocStandalone specUrl="/openapi.json" />',
    );
    expect(getDocsPage("stoplight", "openapi.json")).toContain('apiDescriptionUrl="openapi.json"');
    expect(getDocsPage("rapidoc", "openapi.json")).toContain('spec-url="openapi.json"');
  });

  it("returns empty install flags for non-swagger registry entries", () => {
    expect(getDocsPageInstallFlags("redoc", "npm")).toBe("");
    expect(getDocsPageInstallFlags("stoplight", "pnpm")).toBe("");
    expect(getDocsPageInstallFlags("rapidoc", "yarn")).toBe("");
  });
});
