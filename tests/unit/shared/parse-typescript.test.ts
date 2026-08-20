import { describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

describe("parseTypeScriptFile", () => {
  it("parses TSX with caller-provided parser options", () => {
    const ast = parseTypeScriptFile("const view = <div />;", {
      sourceFilename: "component.tsx",
    });

    expect(ast.program.body).toHaveLength(1);
    expect(ast.loc?.filename).toBe("component.tsx");
  });
});
