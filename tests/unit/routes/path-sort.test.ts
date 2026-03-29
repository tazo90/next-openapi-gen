import { describe, expect, it } from "vitest";

import {
  comparePathDefinitions,
  sortPathDefinitions,
} from "@workspace/openapi-core/routes/path-sort.js";

describe("route path sorting helpers", () => {
  it("sorts paths by primary tag and then by path depth", () => {
    const paths = {
      "/users/settings": {
        get: { tags: ["Users"] },
      },
      "/admin": {
        get: { tags: ["Admin"] },
      },
      "/users": {
        get: { tags: ["Users"] },
      },
    };

    expect(Object.keys(sortPathDefinitions(paths))).toEqual([
      "/admin",
      "/users",
      "/users/settings",
    ]);
  });

  it("handles missing tags and missing path definitions", () => {
    const paths = {
      "/users": {
        get: {},
      },
      "/projects": undefined,
      "/teams/members": {
        get: { tags: [""] },
      },
      "/teams": {
        get: { tags: [] },
      },
    };

    expect(comparePathDefinitions(paths as never, "/teams", "/teams/members")).toBeLessThan(0);
    expect(sortPathDefinitions(paths as never)).toEqual({
      "/users": {
        get: {},
      },
      "/teams": {
        get: { tags: [] },
      },
      "/teams/members": {
        get: { tags: [""] },
      },
    });
  });
});
