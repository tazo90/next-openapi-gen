import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import { GenericRouteSource } from "@workspace/openapi-core/frameworks/shared/generic-route-source.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";

export function createRemixFrameworkSource(
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
): GenericRouteSource {
  return new GenericRouteSource(
    config,
    {
      expandActionMethods: true,
      httpExports: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "loader", "action"],
    },
    performanceProfile,
  );
}
