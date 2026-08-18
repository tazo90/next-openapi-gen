import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import { GenericRouteSource } from "@workspace/openapi-core/frameworks/shared/generic-route-source.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";

export function createAstroFrameworkSource(
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
): GenericRouteSource {
  return new GenericRouteSource(
    config,
    {
      ignoreExportNames: ["prerender"],
      httpExports: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    },
    performanceProfile,
  );
}
