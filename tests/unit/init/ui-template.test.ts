import { describe, expect, it } from "vitest";

import { normalizeRapidocTemplate } from "@workspace/openapi-init/init/rapidoc-template.js";
import { renderUiTemplate } from "@workspace/openapi-init/init/ui-template.js";

describe("ui template helpers", () => {
  it("normalizes the Rapidoc component tags", () => {
    expect(
      normalizeRapidocTemplate(
        'const RapiDoc = "rapi-doc" as any;\n\n<RapiDoc spec-url="openapi.json"></RapiDoc>',
      ),
    ).toBe('<rapi-doc spec-url="openapi.json"></rapi-doc>');
  });

  it("renders built-in templates with the requested output file", () => {
    expect(
      renderUiTemplate("next", "scalar.tsx", {
        outputFile: "openapi.json",
        routePath: "/api-docs",
      }),
    ).toContain('url: "/openapi.json"');
    expect(
      renderUiTemplate("tanstack", "rapidoc.tsx", {
        outputFile: "openapi.json",
        routePath: "/api-docs",
      }),
    ).toContain('createFileRoute("/api-docs")');
    expect(
      renderUiTemplate("tanstack", "rapidoc.tsx", {
        outputFile: "openapi.json",
        routePath: "/api-docs",
      }),
    ).toContain('spec-url="/openapi.json"');
  });
});
