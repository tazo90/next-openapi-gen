import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import { CallExpressionRouteSource } from "@workspace/openapi-core/frameworks/shared/call-expression-route-source.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";

export function createExpressFrameworkSource(
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
): CallExpressionRouteSource {
  return new CallExpressionRouteSource(
    config,
    {
      methodCallees: ["get", "post", "put", "patch", "delete"],
      routeCallee: "route",
      useCallee: "use",
    },
    performanceProfile,
  );
}
