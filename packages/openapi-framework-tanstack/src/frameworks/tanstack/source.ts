import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";
import { GenericRouteSource } from "@workspace/openapi-core/frameworks/shared/generic-route-source.js";

export function createTanStackFrameworkSource(
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
) {
  return new GenericRouteSource(config, {}, performanceProfile);
}
