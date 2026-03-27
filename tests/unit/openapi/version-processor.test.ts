import { describe, expect, it } from "vitest";

import { createDocumentFromTemplate } from "@next-openapi-gen/openapi/document.js";
import { getOpenApiVersionProcessor } from "@next-openapi-gen/openapi/version-processor.js";

describe("OpenAPI version processor", () => {
  it("finalizes public specs without leaking generator config", () => {
    const document = createDocumentFromTemplate({
      openapi: "3.0.0",
      openapiVersion: "3.2",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      paths: {},
      apiDir: "./src/app/api",
      schemaDir: "./src",
      schemaType: "zod",
      outputDir: "./public",
      outputFile: "openapi.json",
      docsUrl: "api-docs",
      ui: "scalar",
      includeOpenApiRoutes: false,
      debug: false,
    });

    const finalized = getOpenApiVersionProcessor("3.2").finalize(document);

    expect(finalized.openapi).toBe("3.2.0");
    expect(finalized).not.toHaveProperty("apiDir");
    expect(finalized).not.toHaveProperty("schemaType");
    expect(finalized).toHaveProperty("paths");
  });
});
