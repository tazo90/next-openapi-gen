import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extendOpenApiTemplate,
  getErrorMessage,
  getOutputPath,
  isJsonConfigPath,
  serializeOpenApiTemplate,
} from "@workspace/openapi-init/init/template.js";

describe("init template helpers", () => {
  it("merges init options into the template in place", () => {
    const template = {
      ui: "scalar",
      docsUrl: "api-docs",
      schemaType: "zod",
    };

    extendOpenApiTemplate(template, {
      ui: "swagger",
      docsUrl: "docs",
      schema: ["zod", "typescript"],
    });

    expect(template).toEqual({
      ui: "swagger",
      docsUrl: "docs",
      schemaType: ["zod", "typescript"],
    });
  });

  it("preserves template fields when corresponding options are omitted", () => {
    const template = {
      ui: "scalar",
      docsUrl: "api-docs",
      schemaType: "zod",
    };

    extendOpenApiTemplate(template, {});

    expect(template).toEqual({
      ui: "scalar",
      docsUrl: "api-docs",
      schemaType: "zod",
    });
  });

  it("resolves relative, absolute, and default output paths", () => {
    const absolutePath = path.join(process.cwd(), "absolute.openapi.json");

    expect(getOutputPath("config/openapi.json")).toBe(
      path.join(process.cwd(), "config/openapi.json"),
    );
    expect(getOutputPath(absolutePath)).toBe(absolutePath);
    expect(getOutputPath()).toBe(path.join(process.cwd(), "openapi-gen.config.ts"));
  });

  it("serializes JSON configs and typed defineConfig modules by extension", () => {
    const template = {
      openapi: "3.0.0",
      info: {
        title: "API Documentation",
        version: "1.0.0",
      },
      schemaType: "zod",
    };

    expect(isJsonConfigPath("next.openapi.json")).toBe(true);
    expect(isJsonConfigPath("openapi-gen.config.ts")).toBe(false);
    expect(serializeOpenApiTemplate(template, "next.openapi.json")).toBe(
      `${JSON.stringify(template, null, 2)}\n`,
    );
    expect(serializeOpenApiTemplate(template, "openapi-gen.config.ts")).toBe(
      `import { defineConfig } from "next-openapi-gen";\n\nexport default defineConfig({\n  openapi: "3.0.0",\n  info: {\n    title: "API Documentation",\n    version: "1.0.0"\n  },\n  schemaType: "zod"\n});\n`,
    );
  });

  it("normalizes error values into strings", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });
});
