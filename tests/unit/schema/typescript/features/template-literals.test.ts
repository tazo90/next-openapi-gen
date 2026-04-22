import { describe, expect, it } from "vitest";

import { resolve } from "./_helpers.js";

describe("TypeScript features › template literal types", () => {
  it("literal template with no interpolation", () => {
    expect(resolve("`hello`")).toEqual({
      type: "string",
      enum: ["hello"],
    });
  });

  it("single interpolation over a string-literal union expands", () => {
    const schema = resolve('`${"a" | "b"}-id`');
    expect(schema).toMatchObject({ type: "string" });
    expect((schema as { enum: string[] }).enum.sort()).toEqual(["a-id", "b-id"]);
  });

  it("two-group interpolation produces the cartesian product", () => {
    const schema = resolve('`${"get" | "post"}_${"users" | "posts"}`');
    expect(schema).toMatchObject({ type: "string" });
    const values = (schema as { enum: string[] }).enum.slice().sort();
    expect(values).toEqual(["get_posts", "get_users", "post_posts", "post_users"].sort());
  });

  it("falls back to plain string when an interpolation type isn't enumerable", () => {
    const schema = resolve("`user-${string}`");
    expect(schema).toMatchObject({ type: "string" });
    expect((schema as { enum?: string[] }).enum).toBeUndefined();
  });

  it("numeric literal interpolation is stringified", () => {
    const schema = resolve("`v${1 | 2}`");
    const values = (schema as { enum: string[] }).enum.slice().sort();
    expect(values).toEqual(["v1", "v2"]);
  });
});
