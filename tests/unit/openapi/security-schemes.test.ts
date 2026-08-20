import { describe, expect, it } from "vitest";

import { ensureBuiltinSecuritySchemes } from "@workspace/openapi-core/openapi/security-schemes.js";
import { DEFAULT_AUTH_PRESET_REPLACEMENTS } from "@workspace/openapi-core/shared/spec.js";
import type { OpenApiDocument } from "@workspace/openapi-core/shared/types.js";

function documentWith(overrides: Partial<OpenApiDocument> = {}): OpenApiDocument {
  return {
    openapi: "3.0.0",
    info: { title: "Auth", version: "1.0.0" },
    ...overrides,
  };
}

describe("ensureBuiltinSecuritySchemes", () => {
  it("emits default objects only for referenced built-in schemes", () => {
    const document = documentWith({
      paths: {
        "/profile": {
          get: { security: [{ BearerAuth: [] }] },
        },
        "/admin": {
          get: { security: [{ BearerAuth: [], ApiKeyAuth: [] }] },
        },
        "/legacy": {
          get: { security: [{ BasicAuth: [] }] },
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, DEFAULT_AUTH_PRESET_REPLACEMENTS);

    expect(document.components?.securitySchemes).toEqual({
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" },
      BasicAuth: { type: "http", scheme: "basic" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });
  });

  it("leaves an existing scheme object unchanged", () => {
    const document = documentWith({
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      paths: {
        "/me": {
          get: { security: [{ BearerAuth: [] }] },
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, DEFAULT_AUTH_PRESET_REPLACEMENTS);

    expect(document.components?.securitySchemes?.BearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
    });
  });

  it("emits the bearer default under a remapped preset name", () => {
    const document = documentWith({
      paths: {
        "/me": {
          get: { security: [{ JwtAuth: [] }] },
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, {
      ...DEFAULT_AUTH_PRESET_REPLACEMENTS,
      bearer: "JwtAuth",
    });

    expect(document.components?.securitySchemes?.JwtAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(document.components?.securitySchemes?.BearerAuth).toBeUndefined();
  });

  it("does not invent custom scheme objects", () => {
    const document = documentWith({
      paths: {
        "/me": {
          get: { security: [{ SessionCookie: [] }, { OAuth2Auth: ["repo"] }] },
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, DEFAULT_AUTH_PRESET_REPLACEMENTS);

    expect(document.components?.securitySchemes).toBeUndefined();
  });

  it("does not emit unused built-in presets", () => {
    const document = documentWith({
      paths: {
        "/me": {
          get: { security: [{ BearerAuth: [] }] },
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, DEFAULT_AUTH_PRESET_REPLACEMENTS);

    expect(document.components?.securitySchemes).toEqual({
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });
  });

  it("emits a referenced root security scheme when operations omit @auth", () => {
    const document = documentWith({
      security: [{ BearerAuth: [] }],
      paths: {
        "/health": {
          get: {},
        },
      },
    });

    ensureBuiltinSecuritySchemes(document, DEFAULT_AUTH_PRESET_REPLACEMENTS);

    expect(document.components?.securitySchemes?.BearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });
});
