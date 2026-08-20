import { describe, expect, it } from "vitest";

describe("next-openapi-gen framework export surfaces", () => {
  it("re-exports plugin helpers for each new framework entry", async () => {
    const remix = await import("../../../packages/next-openapi-gen/src/remix/index.ts");
    const sveltekit = await import("../../../packages/next-openapi-gen/src/sveltekit/index.ts");
    const nuxt = await import("../../../packages/next-openapi-gen/src/nuxt/index.ts");
    const astro = await import("../../../packages/next-openapi-gen/src/astro/index.ts");
    const hono = await import("../../../packages/next-openapi-gen/src/hono/index.ts");
    const express = await import("../../../packages/next-openapi-gen/src/express/index.ts");

    expect(typeof remix.createRemixOpenApiPlugin).toBe("function");
    expect(typeof sveltekit.createSvelteKitOpenApiPlugin).toBe("function");
    expect(typeof nuxt.createNuxtOpenApiModule).toBe("function");
    expect(typeof astro.createAstroOpenApiIntegration).toBe("function");
    expect(typeof hono.createHonoOpenApiPlugin).toBe("function");
    expect(typeof express.generateExpressOpenApi).toBe("function");
  });
});
