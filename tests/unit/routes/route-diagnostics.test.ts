import { describe, expect, it } from "vitest";
import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";

import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import { RouteProcessor } from "@workspace/openapi-core/routes/route-processor.js";
import type { OpenApiConfig } from "@workspace/openapi-core/shared/types.js";

describe("RouteProcessor diagnostics", () => {
  it("records a diagnostic when a path parameter route is missing @pathParams metadata", () => {
    const adapters = createDefaultGenerationAdapters();
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

    const routeProcessor = new RouteProcessor(
      config,
      collector,
      undefined,
      adapters.createFrameworkSource,
    );

    // @ts-expect-error exercising private integration point in focused unit test
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
