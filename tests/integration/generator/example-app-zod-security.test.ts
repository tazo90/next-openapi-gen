import path from "node:path";

import { OpenApiGenerator } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import zodConfig from "../../../apps/next-app-zod/openapi-gen.config.ts";
import { copyProjectFixture, withProjectCwd } from "../../helpers/test-project.js";

const zodAppPath = path.join(process.cwd(), "apps", "next-app-zod");

describe("next-app-zod security generation", { timeout: 15_000 }, () => {
  it("emits OR, AND, and scoped OAuth requirements with preserved scheme objects", () => {
    const project = copyProjectFixture(zodAppPath);

    try {
      const spec = withProjectCwd(project.root, () =>
        new OpenApiGenerator({ config: zodConfig }).generate(),
      );

      expect(spec.paths?.["/auth/session"]?.get?.security).toEqual([
        { BearerAuth: [] },
        { ApiKeyAuth: [] },
      ]);
      expect(spec.paths?.["/auth/elevated"]?.get?.security).toEqual([
        { BearerAuth: [], SessionCookie: [] },
      ]);
      expect(spec.paths?.["/integrations/github"]?.get?.security).toEqual([
        { OAuth2Auth: ["repo", "user"] },
      ]);
      expect(spec.components?.securitySchemes?.BearerAuth).toMatchObject({
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      });
      expect(spec.components?.securitySchemes?.SessionCookie).toEqual({
        type: "apiKey",
        in: "cookie",
        name: "session",
      });
      expect(spec.components?.securitySchemes?.OAuth2Auth).toMatchObject({
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://github.com/login/oauth/authorize",
            tokenUrl: "https://github.com/login/oauth/access_token",
            scopes: {
              repo: "Full repository access",
              user: "Read user profile",
            },
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
