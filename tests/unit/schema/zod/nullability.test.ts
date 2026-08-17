import { describe, expect, it } from "vitest";

import {
  applyNullableToRef,
  applyNullableWrapper,
} from "@workspace/openapi-core/schema/zod/nullability.js";

describe("nullability", () => {
  it("wraps $ref and allOf schemas with anyOf null branches", () => {
    expect(applyNullableWrapper({ $ref: "#/components/schemas/User" })).toEqual({
      anyOf: [{ $ref: "#/components/schemas/User" }, { type: "null" }],
    });
    expect(applyNullableWrapper({ allOf: [{ type: "object" }] })).toEqual({
      anyOf: [{ type: "object" }, { type: "null" }],
    });
  });

  it("sets nullable on inline schemas and named refs", () => {
    expect(applyNullableWrapper({ type: "string" })).toEqual({ type: "string", nullable: true });
    expect(applyNullableToRef("#/components/schemas/User")).toEqual({
      anyOf: [{ $ref: "#/components/schemas/User" }, { type: "null" }],
    });
  });
});
