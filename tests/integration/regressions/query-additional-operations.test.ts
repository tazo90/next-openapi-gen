import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe("OpenAPI 3.2 QUERY operations", () => {
  it("emits @method QUERY routes as the Path Item query field for OpenAPI 3.2", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/search"]?.query).toMatchObject({
        operationId: "query-search",
        summary: "Query search index",
      });
      expect(spec.paths?.["/search"]?.additionalOperations).toBeUndefined();
      expect(spec.paths?.["/search"]?.get).toBeUndefined();
    } finally {
      project.cleanup();
    }
  });

  it("strips the query operation from older OpenAPI targets", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths?.["/search"]?.additionalOperations).toBeUndefined();
      expect(spec.paths?.["/search"]?.query).toBeUndefined();
      expect(spec.paths?.["/search"]?.get).toBeUndefined();
    } finally {
      project.cleanup();
    }
  });
});
