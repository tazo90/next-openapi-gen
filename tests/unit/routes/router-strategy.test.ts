import { describe, expect, it } from "vitest";

import { HTTP_METHODS } from "@next-openapi-gen/routes/router-strategy.js";

describe("router strategy shared constants", () => {
  it("exports the supported HTTP methods in declaration order", () => {
    expect(HTTP_METHODS).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  });
});
