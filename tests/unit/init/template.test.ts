import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extendOpenApiTemplate,
  getErrorMessage,
  getOutputPath,
} from "@workspace/openapi-init/init/template.js";

describe("init template helpers", () => {
  it("merges init options into the template in place", () => {
    const template = {
      ui: "scalar",
      docsUrl: "api-docs",
      schemaType: "zod",
    };

    extendOpenApiTemplate(template as never, {
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

  it("resolves relative, absolute, and default output paths", () => {
    const absolutePath = path.join(process.cwd(), "absolute.openapi.json");

    expect(getOutputPath("config/openapi.json")).toBe(
      path.join(process.cwd(), "config/openapi.json"),
    );
    expect(getOutputPath(absolutePath)).toBe(absolutePath);
    expect(getOutputPath()).toBe(path.join(process.cwd(), "next.openapi.json"));
  });

  it("normalizes error values into strings", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });
});
