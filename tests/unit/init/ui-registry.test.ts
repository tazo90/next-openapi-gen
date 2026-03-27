import { describe, expect, it } from "vitest";

import openapiTemplate from "@next-openapi-gen/init/openapi-template.js";
import {
  getDocsPage,
  getDocsPageDependencies,
  getDocsPageDevDependencies,
  getDocsPageInstallFlags,
  UI_REGISTRY,
  UI_TYPES,
  UI_TYPES_WITH_NONE,
} from "@next-openapi-gen/init/ui-registry.js";
import { RapidocUI, rapidocDeps } from "@next-openapi-gen/init/ui/rapidoc.js";
import { RedocUI, redocDeps } from "@next-openapi-gen/init/ui/redoc.js";
import { ScalarUI, scalarDeps } from "@next-openapi-gen/init/ui/scalar.js";
import { StoplightUI, stoplightDeps } from "@next-openapi-gen/init/ui/stoplight.js";
import { SwaggerUI, swaggerDeps, swaggerDevDeps } from "@next-openapi-gen/init/ui/swagger.js";
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
  it("renders the scalar page and dependency list", () => {
    expect(scalarDeps).toEqual(["@scalar/api-reference-react", "ajv"]);
    expect(ScalarUI("openapi.json")).toContain('url: "/openapi.json"');
  });

  it("renders the swagger page and dependency list", () => {
    expect(swaggerDeps).toEqual(["swagger-ui", "swagger-ui-react"]);
    expect(swaggerDevDeps).toEqual(["@types/swagger-ui-react"]);
    expect(SwaggerUI("openapi.json")).toContain('<SwaggerUI url="/openapi.json" />');
  });

  it("renders the redoc page and dependency list", () => {
    expect(redocDeps).toEqual(["redoc"]);
    expect(RedocUI("openapi.json")).toContain('<RedocStandalone specUrl="/openapi.json" />');
  });

  it("renders the stoplight page and dependency list", () => {
    expect(stoplightDeps).toEqual(["@stoplight/elements"]);
    expect(StoplightUI("openapi.json")).toContain('apiDescriptionUrl="openapi.json"');
  });

  it("renders the rapidoc page and dependency list", () => {
    expect(rapidocDeps).toEqual(["rapidoc"]);
    expect(RapidocUI("openapi.json")).toContain('spec-url="openapi.json"');
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

  it("renders stoplight and rapidoc pages through the registry", () => {
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
