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

  it("sorts same-tag same-depth paths alphabetically by segment", () => {
    const paths = {
      "/users/settings": {
        get: { tags: ["Users"] },
      },
      "/users-paginated": {
        get: { tags: ["Users"] },
      },
      "/users/{id}": {
        get: { tags: ["Users"] },
      },
      "/users": {
        get: { tags: ["Users"] },
      },
    };

    expect(Object.keys(sortPathDefinitions(paths))).toEqual([
      "/users",
      "/users-paginated",
      "/users/{id}",
      "/users/settings",
    ]);
  });

  it("reorders methods inside a path into HTTP-semantic order", () => {
    const paths = {
      "/items": {
        delete: { tags: ["Items"] },
        post: { tags: ["Items"] },
        get: { tags: ["Items"] },
        patch: { tags: ["Items"] },
        put: { tags: ["Items"] },
      },
    };

    expect(Object.keys(sortPathDefinitions(paths)["/items"])).toEqual([
      "get",
      "post",
      "put",
      "patch",
      "delete",
    ]);
  });

  it("places unknown methods after known ones, alphabetically", () => {
    const paths = {
      "/items": {
        zebra: { tags: ["Items"] },
        get: { tags: ["Items"] },
        custom: { tags: ["Items"] },
        post: { tags: ["Items"] },
      },
    };

    expect(Object.keys(sortPathDefinitions(paths as never)["/items"])).toEqual([
      "get",
      "post",
      "custom",
      "zebra",
    ]);
  });
});
