import { describe, expect, it } from "vitest";

import { normalizeRapidocTemplate } from "@workspace/openapi-init/init/rapidoc-template.js";
import {
  getUiTemplateFileName,
  renderUiTemplate,
  resolveUiTemplatePath,
} from "@workspace/openapi-init/init/ui-template.js";

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

  it("maps each init framework to its template extension and directory", () => {
    const options = { outputFile: "openapi.json", routePath: "/api-docs" };

    expect(getUiTemplateFileName("sveltekit", "scalar.tsx")).toBe("scalar.svelte");
    expect(getUiTemplateFileName("nuxt", "scalar.tsx")).toBe("scalar.vue");
    expect(getUiTemplateFileName("astro", "scalar.tsx")).toBe("scalar.astro");
    expect(getUiTemplateFileName("hono", "scalar.tsx")).toBe("scalar.ts");
    expect(getUiTemplateFileName("express", "scalar.tsx")).toBe("scalar.ts");
    expect(getUiTemplateFileName("remix", "scalar.tsx")).toBe("scalar.tsx");
    expect(resolveUiTemplatePath("react-router", "scalar.tsx")).toContain("reactrouter");
    expect(renderUiTemplate("remix", "scalar.tsx", options)).toContain("openapi.json");
    expect(renderUiTemplate("sveltekit", "scalar.tsx", options)).toContain("openapi.json");
    expect(renderUiTemplate("nuxt", "scalar.tsx", options)).toContain("openapi.json");
    expect(renderUiTemplate("astro", "scalar.tsx", options)).toContain("openapi.json");
    expect(renderUiTemplate("hono", "scalar.tsx", options)).toContain("openapi.json");
    expect(renderUiTemplate("express", "scalar.tsx", options)).toContain("openapi.json");
  });

  it("throws for unknown init frameworks", () => {
    expect(() => getUiTemplateFileName("unknown" as never, "scalar.tsx")).toThrow(
      'Unknown init framework "unknown"',
    );
    expect(() => resolveUiTemplatePath("unknown" as never, "scalar.tsx")).toThrow(
      'Unknown init framework "unknown"',
    );
  });
});
