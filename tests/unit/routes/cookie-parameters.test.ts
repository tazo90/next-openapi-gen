import { describe, expect, it, vi } from "vitest";

import { createEmptyGenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import { createCookieParameters } from "@workspace/openapi-core/routes/cookie-parameters.js";

describe("createCookieParameters", () => {
  it("returns no parameters when cookieType is missing", () => {
    const getSchemaContent = vi.fn<() => { params: Record<string, unknown> }>();
    const createRequestParamsSchema = vi.fn<() => unknown[]>();

    expect(
      createCookieParameters({
        dataTypes: {},
        schemaProcessor: { getSchemaContent, createRequestParamsSchema } as never,
      }),
    ).toEqual([]);
    expect(getSchemaContent).not.toHaveBeenCalled();
    expect(createRequestParamsSchema).not.toHaveBeenCalled();
  });

  it("builds cookie parameters from the cookie schema", () => {
    const cookies = [
      {
        name: "session",
        in: "cookie",
        required: true,
        schema: { type: "string" },
      },
    ];
    const getSchemaContent = vi.fn<() => { params: { session: { type: string } } }>(() => ({
      params: { session: { type: "string" } },
    }));
    const createRequestParamsSchema = vi.fn<() => typeof cookies>(() => cookies);
    const performanceProfile = createEmptyGenerationPerformanceProfile();

    expect(
      createCookieParameters({
        dataTypes: { cookieType: "SessionCookies" },
        schemaProcessor: { getSchemaContent, createRequestParamsSchema } as never,
        performanceProfile,
      }),
    ).toEqual(cookies);
    expect(getSchemaContent).toHaveBeenCalledWith({ paramsType: "SessionCookies" });
    expect(createRequestParamsSchema).toHaveBeenCalledWith(
      { session: { type: "string" } },
      false,
      "cookie",
    );
    expect(performanceProfile.getSchemaContentMs).toBeGreaterThanOrEqual(0);
    expect(performanceProfile.createRequestParamsMs).toBeGreaterThanOrEqual(0);
  });
});
