import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const securitySchemesFixture = getProjectFixturePath("next", "app-router", "security-schemes");

describe("generated security schemes", () => {
  it("emits default scheme objects for referenced built-in presets", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: securitySchemesFixture,
    });

    try {
      expect(spec.paths?.["/profile"]?.get?.security).toEqual([{ BearerAuth: [] }]);
      expect(spec.paths?.["/admin"]?.get?.security).toEqual([{ BearerAuth: [], ApiKeyAuth: [] }]);
      expect(spec.paths?.["/legacy"]?.get?.security).toEqual([{ BasicAuth: [] }]);
      expect(spec.paths?.["/public"]?.get?.security).toBeUndefined();
      expect(spec.components?.securitySchemes).toEqual({
        ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" },
        BasicAuth: { type: "http", scheme: "basic" },
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      });
    } finally {
      project.cleanup();
    }
  });
});
