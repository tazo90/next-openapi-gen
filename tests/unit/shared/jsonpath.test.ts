import { describe, expect, it } from "vitest";

import { queryJsonPath } from "@workspace/openapi-core/shared/jsonpath.js";

const document = {
  paths: {
    "/pets": { get: { operationId: "listPets" } },
    "/webhooks/payment": { post: { operationId: "receivePayment" } },
  },
  tags: [
    { name: "pets", kind: "nav" },
    { name: "internal", kind: "audience" },
  ],
};

describe("JSONPath subset", () => {
  it("selects child, quoted, wildcard, and index segments", () => {
    expect(
      queryJsonPath(document, "$.paths['/pets'].get.operationId").map((match) => match.value),
    ).toEqual(["listPets"]);
    expect(queryJsonPath(document, "$.tags[0].name").map((match) => match.value)).toEqual(["pets"]);
    expect(queryJsonPath(document, "$.tags[*].name").map((match) => match.value)).toEqual([
      "pets",
      "internal",
    ]);
  });

  it("selects descendants, slices, and simple filters", () => {
    expect(queryJsonPath(document, "$..operationId").map((match) => match.value)).toEqual([
      "listPets",
      "receivePayment",
    ]);
    expect(queryJsonPath(document, "$.tags[0:1].name").map((match) => match.value)).toEqual([
      "pets",
    ]);
    expect(
      queryJsonPath(document, "$.tags[?(@.kind == 'audience')].name").map((match) => match.value),
    ).toEqual(["internal"]);
    expect(queryJsonPath(document, "$.tags[-1].name").map((match) => match.value)).toEqual([
      "internal",
    ]);
    expect(queryJsonPath(document, "$.missing").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(document, "$").map((match) => match.value)).toEqual([document]);
    expect(
      queryJsonPath(document, "$.tags[?(@.kind != 'nav')].name").map((match) => match.value),
    ).toEqual(["internal"]);
    expect(queryJsonPath(document, "$..*").length).toBeGreaterThan(0);
    expect(queryJsonPath(document, "$..['operationId']").map((match) => match.value)).toEqual([
      "listPets",
      "receivePayment",
    ]);
    expect(
      queryJsonPath(document, "$.paths.*").map((match) => Object.keys(match.value as object)),
    ).toEqual(expect.arrayContaining([["get"], ["post"]]));
    expect(() => queryJsonPath(document, "paths")).toThrow("JSONPath must start with $");
    expect(() => queryJsonPath(document, "$.tags[?(@.kind == 'audience'")).toThrow(
      "Unclosed filter",
    );
  });

  it("covers filter literals, negative slices, and non-collection matches", () => {
    const tree = {
      items: [true, false, null, 1.5, "keep"],
      nested: {
        items: [
          { active: true, count: 1.5, flag: false, value: null },
          { active: false, count: 2, flag: true, value: "x" },
        ],
      },
    };

    expect(queryJsonPath(tree, "$.items[?(@)]").map((match) => match.value)).toEqual([
      true,
      false,
      1.5,
      "keep",
    ]);
    expect(
      queryJsonPath(tree, "$.nested.items[?(@.active == true)]").map((match) => match.value),
    ).toEqual([{ active: true, count: 1.5, flag: false, value: null }]);
    expect(
      queryJsonPath(tree, "$.nested.items[?(@.active != false)]").map((match) => match.value),
    ).toEqual([{ active: true, count: 1.5, flag: false, value: null }]);
    expect(
      queryJsonPath(tree, "$.nested.items[?(@.count == 1.5)]").map((match) => match.value),
    ).toHaveLength(1);
    expect(
      queryJsonPath(tree, "$.nested.items[?(@.flag == false)]").map((match) => match.value),
    ).toHaveLength(1);
    expect(
      queryJsonPath(tree, "$.nested.items[?(@.value == null)]").map((match) => match.value),
    ).toHaveLength(1);
    expect(queryJsonPath(tree, "$.items[-2:]").map((match) => match.value)).toEqual([1.5, "keep"]);
    expect(queryJsonPath(tree, "$.items[10]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.items[*]").length).toBe(5);
    expect(queryJsonPath("scalar", "$.missing").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.items[?(@.missing)]").map((match) => match.value)).toEqual([]);
  });

  it("covers leftover descendant brackets, slices, escapes, and parse errors", () => {
    const tree = {
      items: [0, 1, 2, 3],
      nested: { items: [{ id: 1 }, { id: 2 }] },
      "ite]ms": ["escaped"],
    };

    expect(queryJsonPath(tree, "$..[*]").map((match) => match.value)).toEqual(
      expect.arrayContaining([0, 1, 2, 3]),
    );
    expect(queryJsonPath(tree, "$..[0]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.items[:]").map((match) => match.value)).toEqual([0, 1, 2, 3]);
    expect(queryJsonPath(tree, "$.items[:-1]").map((match) => match.value)).toEqual([0, 1, 2]);
    expect(queryJsonPath(tree, `$["items"]`).map((match) => match.value)).toEqual([[0, 1, 2, 3]]);
    expect(queryJsonPath({ ab: 1 }, '$["a\\b"]').map((match) => match.value)).toEqual([1]);
    expect(queryJsonPath({ keep: true }, "$[?(@)]").map((match) => match.value)).toEqual([true]);
  });

  it.each([
    ["$.items[", "Unsupported JSONPath bracket selector"],
    ["$.items[* extra]", "Expected ']' after wildcard"],
    ['$["items"', "Expected ']' after quoted name"],
    ["$.items[0 extra]", "Expected ']' after index"],
    ["$paths", "Unexpected JSONPath token"],
    ["$.", "Expected identifier"],
    ["$..", "Expected identifier"],
  ] as const)("rejects %s with %s", (path, message) => {
    expect(() => queryJsonPath({}, path)).toThrow(message);
  });

  it("covers descendant filters, quoted filter keys, and non-collection walks", () => {
    const tree = {
      tags: [
        { kind: "nav", label: "pets" },
        { kind: "audience", label: "internal" },
      ],
      scalar: "ignore",
    };

    expect(
      queryJsonPath(tree, `$.tags[?(@.kind == "audience")].label`).map((match) => match.value),
    ).toEqual(["internal"]);
    expect(
      queryJsonPath(tree, "$.tags[?(@.label == internal)]").map((match) => match.value),
    ).toHaveLength(1);
    expect(queryJsonPath(tree, "$..[?(@.kind == 'nav')]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.scalar[0:1]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.scalar[0]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.scalar[*]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.tags[-10]").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$..missing").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.tags[ * ].kind").map((match) => match.value)).toEqual([
      "nav",
      "audience",
    ]);
    expect(queryJsonPath(tree, `$.tags[ "kind" ]`).map((match) => match.value)).toEqual([]);
    expect(queryJsonPath("scalar", "$.*").map((match) => match.value)).toEqual([]);
    expect(queryJsonPath(tree, "$.tags[?(@.kind)]").map((match) => match.value)).toEqual([]);
  });
});
