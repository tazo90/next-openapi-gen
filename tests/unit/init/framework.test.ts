import { describe, expect, it } from "vitest";

import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import {
  getInitFrameworkTemplateOverrides,
  INIT_FRAMEWORKS,
} from "@workspace/openapi-init/init/framework.js";

describe("init framework overrides", () => {
  it("lists the supported init frameworks", () => {
    expect(INIT_FRAMEWORKS).toEqual(["next", "tanstack", "react-router"]);
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
  ] as const)("returns %s overrides", (framework, kind, apiDir, includeOpenApiRoutes) => {
    expect(getInitFrameworkTemplateOverrides(framework)).toMatchObject({
      apiDir,
      includeOpenApiRoutes,
      framework: { kind },
    });
  });
});
