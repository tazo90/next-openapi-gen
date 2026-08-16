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
  });
});
