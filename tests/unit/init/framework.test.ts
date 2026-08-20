import { describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import {
  getInitFrameworkTemplateOverrides,
  INIT_FRAMEWORKS,
} from "@workspace/openapi-init/init/framework.js";

describe("init framework overrides", () => {
  it("lists the supported init frameworks", () => {
    expect(INIT_FRAMEWORKS).toEqual([
      "next",
      "tanstack",
      "react-router",
      "remix",
      "sveltekit",
      "nuxt",
      "astro",
      "hono",
      "express",
    ]);
  });

  it("defaults to Next.js app-router overrides", () => {
    expect(getInitFrameworkTemplateOverrides()).toMatchObject({
      apiDir: "./src/app/api",
      includeOpenApiRoutes: false,
      framework: { kind: FrameworkKind.Nextjs, router: "app" },
    });
  });

  it.each([
    ["tanstack", FrameworkKind.Tanstack, "./src/routes/api", true],
    ["react-router", FrameworkKind.ReactRouter, "./src/routes/api", true],
    ["remix", FrameworkKind.Remix, "./app/routes", true],
    ["sveltekit", FrameworkKind.SvelteKit, "./src/routes", true],
    ["nuxt", FrameworkKind.Nuxt, "./server/api", true],
    ["astro", FrameworkKind.Astro, "./src/pages/api", true],
    ["hono", FrameworkKind.Hono, "./src", true],
    ["express", FrameworkKind.Express, "./src", true],
  ] as const)("returns %s overrides", (framework, kind, apiDir, includeOpenApiRoutes) => {
    expect(getInitFrameworkTemplateOverrides(framework)).toMatchObject({
      apiDir,
      includeOpenApiRoutes,
      framework: { kind },
    });
  });
});
