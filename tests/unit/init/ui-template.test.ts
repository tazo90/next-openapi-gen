import { describe, expect, it } from "vitest";

import { normalizeRapidocTemplate } from "@next-openapi-gen/init/rapidoc-template.js";
import { renderUiTemplate } from "@next-openapi-gen/init/ui-template.js";

describe("ui template helpers", () => {
  it("normalizes the Rapidoc component tags", () => {
    expect(
      normalizeRapidocTemplate(
        'const RapiDoc = "rapi-doc" as any;\n\n<RapiDoc spec-url="openapi.json"></RapiDoc>',
      ),
    ).toBe('<rapi-doc spec-url="openapi.json"></rapi-doc>');
  });

  it("renders built-in templates with the requested output file", () => {
    expect(renderUiTemplate("scalar.tsx", { outputFile: "openapi.json" })).toContain(
      'url: "/openapi.json"',
    );
    expect(renderUiTemplate("rapidoc.tsx", { outputFile: "openapi.json" })).toContain(
      'spec-url="openapi.json"',
    );
  });
});
