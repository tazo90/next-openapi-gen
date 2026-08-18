import { describe, expect, it } from "vitest";

import { detectDocumentFormat, overlayTargetFormatMatches } from "@workspace/openapi-overlay";

describe("overlay target format", () => {
  it("detects reserved document formats and ignores other values", () => {
    expect(detectDocumentFormat({ openapi: "3.2.0" })).toBe("openapi");
    expect(detectDocumentFormat({ asyncapi: "3.0.0" })).toBe("asyncapi");
    expect(detectDocumentFormat({ arazzo: "1.1.0" })).toBe("arazzo");
    expect(detectDocumentFormat({ info: { title: "Unknown" } })).toBeUndefined();
    expect(detectDocumentFormat(null)).toBeUndefined();
    expect(detectDocumentFormat(["openapi"])).toBeUndefined();
  });

  it("matches when targetFormat is omitted or unrecognized", () => {
    expect(
      overlayTargetFormatMatches(
        { openapi: "3.2.0" },
        { overlay: "1.2.0", info: { title: "Overlay", version: "1.0.0" }, actions: [] },
      ),
    ).toEqual({ ok: true });
    expect(
      overlayTargetFormatMatches(
        { openapi: "3.2.0" },
        {
          overlay: "1.2.0",
          info: { title: "Overlay", version: "1.0.0" },
          targetFormat: "https://example.com/formats/custom",
          actions: [],
        },
      ),
    ).toEqual({ ok: true });
  });

  it("matches reserved targetFormat values against the document root field", () => {
    expect(
      overlayTargetFormatMatches(
        { openapi: "3.2.0" },
        {
          overlay: "1.2.0",
          info: { title: "Overlay", version: "1.0.0" },
          targetFormat: "openapi",
          actions: [],
        },
      ),
    ).toEqual({ ok: true });
    expect(
      overlayTargetFormatMatches(
        { info: { title: "Unknown" } },
        {
          overlay: "1.2.0",
          info: { title: "Overlay", version: "1.0.0" },
          targetFormat: "asyncapi",
          actions: [],
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects reserved targetFormat values that disagree with the document", () => {
    expect(
      overlayTargetFormatMatches(
        { openapi: "3.2.0" },
        {
          overlay: "1.2.0",
          info: { title: "Overlay", version: "1.0.0" },
          targetFormat: "asyncapi",
          actions: [],
        },
      ),
    ).toEqual({ ok: false, expected: "asyncapi", actual: "openapi" });
  });
});
