import { describe, expect, it } from "vitest";

import { ZOD_IMPORT_PATHS, isZodImportPath } from "@next-openapi-gen/schema/zod/compat.js";

describe("zod compat helpers", () => {
  it("recognizes supported zod import paths", () => {
    expect(ZOD_IMPORT_PATHS).toEqual(["zod", "zod/v3", "zod/v4"]);
    expect(isZodImportPath("zod")).toBe(true);
    expect(isZodImportPath("zod/v3")).toBe(true);
    expect(isZodImportPath("zod/v4")).toBe(true);
    expect(isZodImportPath("zod/v5")).toBe(false);
    expect(isZodImportPath("./zod")).toBe(false);
  });
});
