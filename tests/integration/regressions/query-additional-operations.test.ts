import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe("OpenAPI 3.2 additionalOperations", () => {
  it("emits @method QUERY routes as additionalOperations for OpenAPI 3.2", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/search"]?.additionalOperations).toMatchObject({
        query: {
          operationId: "query-search",
          summary: "Query search index",
        },
      });
      expect(spec.paths?.["/search"]?.get).toBeUndefined();
    } finally {
      project.cleanup();
    }
  });

  it("strips additionalOperations from older OpenAPI targets", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths?.["/search"]?.additionalOperations).toBeUndefined();
      expect(spec.paths?.["/search"]?.get).toBeUndefined();
    } finally {
      project.cleanup();
    }
  });
});
