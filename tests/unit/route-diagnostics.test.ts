import { describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "@next-openapi-gen/diagnostics/collector.js";
import { RouteProcessor } from "@next-openapi-gen/routes/route-processor.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";

describe("RouteProcessor diagnostics", () => {
  it("records a diagnostic when a path parameter route is missing @pathParams metadata", () => {
    const collector = new DiagnosticsCollector();
    const config: OpenApiConfig = {
      apiDir: "./src/app/api",
      schemaDir: "./src",
      docsUrl: "api-docs",
      ui: "scalar",
      outputFile: "openapi.json",
      outputDir: "./public",
      includeOpenApiRoutes: false,
      schemaType: "typescript",
      debug: false,
    };

    const routeProcessor = new RouteProcessor(config, collector);

    // @ts-ignore - exercising private integration point
    routeProcessor.registerRoute("GET", "./src/app/api/users/[id]/route.ts", {});

    expect(collector.getAll()).toEqual([
      expect.objectContaining({
        code: "missing-path-params-type",
        severity: "warning",
        routePath: "/users/{id}",
      }),
    ]);
  });
});
