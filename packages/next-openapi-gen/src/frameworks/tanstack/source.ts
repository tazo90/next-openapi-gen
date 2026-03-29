import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import { GenericRouteSource } from "../shared/generic-route-source.js";

export function createTanStackFrameworkSource(config: ResolvedOpenApiConfig) {
  return new GenericRouteSource(config);
}
