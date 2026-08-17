import { describe, expect, it } from "vitest";

import {
  cleanSpec,
  deepMerge,
  performAuthPresetReplacements,
} from "@workspace/openapi-core/shared/spec.js";

describe("spec", () => {
  it("normalizes auth preset casing while keeping unknown entries", () => {
    expect(performAuthPresetReplacements("BEARER, apiKey, custom-scheme")).toBe(
      "BearerAuth,ApiKeyAuth,custom-scheme",
    );
  });

  it("applies custom presets when provided, with user keys winning over defaults", () => {
    const custom = { bearer: "JwtAuth", oauth2: "OAuth2Auth" };
    expect(performAuthPresetReplacements("bearer", custom)).toBe("JwtAuth");
    expect(performAuthPresetReplacements("bearer,oauth2", custom)).toBe("JwtAuth,OAuth2Auth");
    expect(performAuthPresetReplacements("bearer,CustomScheme", custom)).toBe(
      "JwtAuth,CustomScheme",
    );
  });

  it("adds path parameter examples without clobbering existing values", () => {
    const spec = cleanSpec({
      paths: {
        "/users/{id}/{slug}/{category}": {
          get: {
            parameters: [
              { name: "id", in: "path" },
              { name: "slug", in: "path" },
              { name: "category", in: "path" },
              { name: "preset", in: "path", example: "keep-me" },
              { name: "ignored", in: "query" },
            ],
          },
        },
      },
    });

    expect(spec.paths["/users/{id}/{slug}/{category}"].get.parameters).toEqual([
      { name: "id", in: "path", example: 123 },
      { name: "slug", in: "path", example: "example-slug" },
      { name: "category", in: "path", example: "example" },
      { name: "preset", in: "path", example: "keep-me" },
      { name: "ignored", in: "query" },
    ]);
  });

  it("skips missing path definitions and operations while cleaning specs", () => {
    const spec = cleanSpec({
      paths: {
        "/users/{id}": {
          get: undefined,
        },
        "/projects/{slug}": undefined,
      },
    });

    expect(spec.paths["/users/{id}"].get).toBeUndefined();
    expect(spec.paths["/projects/{slug}"]).toBeUndefined();
  });
});

describe("deepMerge", () => {
  it("merges top-level keys", () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 1, b: 2 });
  });

  it("source overwrites target for primitives", () => {
    const target = { a: 1 };
    const source = { a: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 2 });
  });

  it("recursively merges nested plain objects", () => {
    const target = { outer: { a: 1, b: 2 } };
    const source = { outer: { b: 3, c: 4 } };
    deepMerge(target, source);
    expect(target).toEqual({ outer: { a: 1, b: 3, c: 4 } });
  });

  it("preserves existing nested keys from target when source does not provide them", () => {
    const target = {
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/Foo" } } },
      },
    };
    const source = { requestBody: { required: true } };
    deepMerge(target, source);
    expect(target).toEqual({
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/Foo" } } },
        required: true,
      },
    });
  });

  it("replaces arrays instead of merging them", () => {
    const target = { tags: ["a", "b"] };
    const source = { tags: ["c"] };
    deepMerge(target, source);
    expect(target).toEqual({ tags: ["c"] });
  });

  it("replaces target value when source is an object and target is a primitive", () => {
    const target = { x: 5 };
    const source = { x: { nested: true } };
    deepMerge(target, source);
    expect(target).toEqual({ x: { nested: true } });
  });

  it("replaces target value when source is a primitive and target is an object", () => {
    const target = { x: { nested: true } };
    const source = { x: "replaced" };
    deepMerge(target, source);
    expect(target).toEqual({ x: "replaced" });
  });

  it("handles null source values as replacement", () => {
    const target = { a: { nested: true } };
    const source = { a: null };
    deepMerge(target, source);
    expect(target).toEqual({ a: null });
  });

  it("returns target unchanged for empty source", () => {
    const target = { a: 1 };
    deepMerge(target, {});
    expect(target).toEqual({ a: 1 });
  });
});
