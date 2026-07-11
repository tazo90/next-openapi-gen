import { describe, expect, it } from "vitest";

import { resolveAnnotationTypeName } from "../../../packages/openapi-core/src/shared/utils.js";

describe("resolveAnnotationTypeName", () => {
  it("treats empty JSDoc annotation values as absent so inferred types can apply", () => {
    expect(resolveAnnotationTypeName("", "organizationParamsSchema")).toBe(
      "organizationParamsSchema",
    );
    expect(resolveAnnotationTypeName("   ", "QuerySchema")).toBe("QuerySchema");
  });

  it("prefers explicit annotation values over inferred fallbacks", () => {
    expect(resolveAnnotationTypeName("ExplicitParams", "InferredParams")).toBe("ExplicitParams");
  });
});
