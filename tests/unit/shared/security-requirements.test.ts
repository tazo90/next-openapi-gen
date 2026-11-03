import { describe, expect, it } from "vitest";

import {
  applyAuthPresets,
  isPublicSecurity,
  parseSecurityRequirementList,
} from "@workspace/openapi-core/shared/security-requirements.js";
import { DEFAULT_AUTH_PRESET_REPLACEMENTS } from "@workspace/openapi-core/shared/spec.js";

describe("isPublicSecurity", () => {
  it("is true only when every requirement is empty", () => {
    expect(isPublicSecurity([{}])).toBe(true);
    expect(isPublicSecurity([])).toBe(false);
    expect(isPublicSecurity([{}, { bearer: [] }])).toBe(false);
  });
});

describe("parseSecurityRequirementList", () => {
  it("returns no requirements for empty or whitespace input", () => {
    expect(parseSecurityRequirementList("")).toEqual([]);
    expect(parseSecurityRequirementList("   ")).toEqual([]);
  });

  it("turns a lone none alternative into the empty requirement", () => {
    expect(parseSecurityRequirementList("none")).toEqual([{}]);
    expect(parseSecurityRequirementList(" None ")).toEqual([{}]);
    expect(parseSecurityRequirementList("bearer, none")).toEqual([{ bearer: [] }, {}]);
  });

  it("keeps none as a scheme name when it carries scopes or is combined", () => {
    expect(parseSecurityRequirementList("none:read")).toEqual([{ none: ["read"] }]);
    expect(parseSecurityRequirementList("none;bearer")).toEqual([{ none: [], bearer: [] }]);
  });

  it("treats comma-separated schemes as alternative requirements", () => {
    expect(parseSecurityRequirementList("BearerAuth, ApiKeyAuth")).toEqual([
      { BearerAuth: [] },
      { ApiKeyAuth: [] },
    ]);
  });

  it("treats semicolon-separated schemes as a combined requirement", () => {
    expect(parseSecurityRequirementList("bearer;apikey")).toEqual([{ bearer: [], apikey: [] }]);
  });

  it("combines AND groups with OR alternatives", () => {
    expect(parseSecurityRequirementList("bearer;apikey,custom")).toEqual([
      { bearer: [], apikey: [] },
      { custom: [] },
    ]);
  });

  it("attaches comma-separated scopes after the first colon", () => {
    expect(parseSecurityRequirementList("bearer:read,write; apiKey")).toEqual([
      { bearer: ["read", "write"], apiKey: [] },
    ]);
  });

  it("keeps colons inside OAuth-style scopes", () => {
    expect(parseSecurityRequirementList("OAuth2Auth:read:pets,write:pets")).toEqual([
      { OAuth2Auth: ["read:pets", "write:pets"] },
    ]);
  });

  it("splits scopes on | after the first colon", () => {
    expect(parseSecurityRequirementList("BearerAuth, ApiKeyAuth:read:events|write:events")).toEqual(
      [{ BearerAuth: [] }, { ApiKeyAuth: ["read:events", "write:events"] }],
    );
  });

  it("skips entries that do not start with a scheme name", () => {
    expect(parseSecurityRequirementList(":empty, Admin")).toEqual([{ Admin: [] }]);
  });
});

describe("applyAuthPresets", () => {
  it("maps built-in preset keywords after parse", () => {
    expect(
      applyAuthPresets(
        parseSecurityRequirementList("bearer,apikey"),
        DEFAULT_AUTH_PRESET_REPLACEMENTS,
      ),
    ).toEqual([{ BearerAuth: [] }, { ApiKeyAuth: [] }]);
  });

  it("maps remapped preset names inside an AND group", () => {
    expect(
      applyAuthPresets(parseSecurityRequirementList("bearer;apikey"), {
        ...DEFAULT_AUTH_PRESET_REPLACEMENTS,
        bearer: "JwtAuth",
      }),
    ).toEqual([{ JwtAuth: [], ApiKeyAuth: [] }]);
  });
});
