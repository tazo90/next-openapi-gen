import { createNextFrameworkSource } from "./next/source.js";
import { createReactRouterFrameworkSource } from "./react-router/source.js";
import { createTanStackFrameworkSource } from "./tanstack/source.js";
import type { FrameworkSource } from "./types.js";
import { FrameworkKind, type ResolvedOpenApiConfig } from "../shared/types.js";

export function createFrameworkSource(config: ResolvedOpenApiConfig): FrameworkSource {
  switch (config.framework.kind) {
    case FrameworkKind.Nextjs:
      return createNextFrameworkSource(config);
    case FrameworkKind.Tanstack:
      return createTanStackFrameworkSource(config);
    case FrameworkKind.ReactRouter:
      return createReactRouterFrameworkSource(config);
  }
}
