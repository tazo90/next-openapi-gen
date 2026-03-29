import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import { GenericRouteSource } from "../shared/generic-route-source.js";

export function createReactRouterFrameworkSource(config: ResolvedOpenApiConfig) {
  return new GenericRouteSource(config);
}
