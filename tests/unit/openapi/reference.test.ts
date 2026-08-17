import { describe, expect, it } from "vitest";

import {
  isOpenApiParameter,
  isOpenApiReference,
} from "@workspace/openapi-core/openapi/reference.js";

describe("isOpenApiReference", () => {
  it("accepts a $ref object with optional summary and description", () => {
    expect(isOpenApiReference({ $ref: "#/components/schemas/User" })).toBe(true);
    expect(
      isOpenApiReference({
        $ref: "#/components/schemas/User",
        summary: "User",
        description: "A user",
      }),
    ).toBe(true);
  });

  it("rejects non-objects, missing $ref, and extra keys", () => {
    expect(isOpenApiReference(null)).toBe(false);
    expect(isOpenApiReference("ref")).toBe(false);
    expect(isOpenApiReference([])).toBe(false);
    expect(isOpenApiReference({ $ref: 1 })).toBe(false);
    expect(isOpenApiReference({ $ref: "#/components/schemas/User", in: "path" })).toBe(false);
  });
});

describe("isOpenApiParameter", () => {
  it("accepts parameter objects and rejects references", () => {
    expect(isOpenApiParameter({ name: "id", in: "path" })).toBe(true);
    expect(isOpenApiParameter({ $ref: "#/components/parameters/Id" })).toBe(false);
  });
});
