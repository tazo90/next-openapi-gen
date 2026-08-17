import { describe, expect, it } from "vitest";

import {
  capitalize,
  escapeRegExp,
  extractPathParameters,
  getOperationId,
  resolveAnnotationTypeName,
  toCamelCase,
} from "@workspace/openapi-core/shared/strings.js";

describe("strings", () => {
  it("formats strings and route metadata helpers", () => {
    expect(capitalize("users")).toBe("Users");
    expect(extractPathParameters("/users/{id}/posts/{postId}")).toEqual(["id", "postId"]);
    expect(extractPathParameters("/users")).toEqual([]);
    expect(getOperationId("/users/{id}", "get")).toBe("get-users-{id}");
    expect(escapeRegExp("a+b*c?")).toBe("a\\+b\\*c\\?");
    expect(resolveAnnotationTypeName(" User ", "Fallback")).toBe("User");
    expect(resolveAnnotationTypeName("  ", " Fallback ")).toBe("Fallback");
    expect(resolveAnnotationTypeName(undefined, "  ")).toBeUndefined();
    expect(toCamelCase("advanced query filter")).toBe("advancedQueryFilter");
    expect(toCamelCase("***")).toBe("query");
  });
});
