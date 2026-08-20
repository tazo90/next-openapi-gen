import { describe, expect, it } from "vitest";

import {
  getPathItemOperations,
  isOpenApiHttpMethod,
  setPathItemOperation,
} from "@workspace/openapi-core/openapi/path-item.js";

describe("path item helpers", () => {
  it("reads standard and additional operations", () => {
    expect(isOpenApiHttpMethod("get")).toBe(true);
    expect(isOpenApiHttpMethod("purge")).toBe(false);
    expect(
      getPathItemOperations({
        get: { operationId: "list" },
        additionalOperations: {
          PURGE: { operationId: "purge" },
        },
      }),
    ).toEqual([
      ["get", { operationId: "list" }],
      ["PURGE", { operationId: "purge" }],
    ]);
  });

  it("writes standard methods and additional operations", () => {
    const pathItem = {};
    setPathItemOperation(pathItem, "POST", { operationId: "create" });
    setPathItemOperation(pathItem, "PURGE", { operationId: "purge" });
    expect(pathItem).toEqual({
      post: { operationId: "create" },
      additionalOperations: {
        PURGE: { operationId: "purge" },
      },
    });
  });
});
