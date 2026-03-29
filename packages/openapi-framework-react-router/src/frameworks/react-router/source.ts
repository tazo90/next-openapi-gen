import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";
import { GenericRouteSource } from "@workspace/openapi-core/frameworks/shared/generic-route-source.js";

export function createReactRouterFrameworkSource(config: ResolvedOpenApiConfig) {
  return new GenericRouteSource(config);
}
