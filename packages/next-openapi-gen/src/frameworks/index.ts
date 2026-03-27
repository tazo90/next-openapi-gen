import { createNextFrameworkAdapter } from "./next/adapter.js";
import type { FrameworkAdapter } from "./types.js";
import type { ResolvedOpenApiConfig } from "../shared/types.js";

export function createFrameworkAdapter(config: ResolvedOpenApiConfig): FrameworkAdapter {
  switch (config.framework.kind) {
    case "next":
      return createNextFrameworkAdapter(config);
    case "tanstack":
      throw new Error("TanStack framework support is not implemented yet.");
  }
}
