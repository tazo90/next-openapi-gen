import { generateProject } from "../core/generate.js";

export type NextAdapterLike = {
  name: string;
  onBuildComplete?: () => Promise<void> | void;
};

export type NextOpenApiAdapterOptions = {
  configPath?: string | undefined;
};

export function createNextOpenApiAdapter(options: NextOpenApiAdapterOptions = {}): NextAdapterLike {
  return {
    name: "next-openapi-gen",
    async onBuildComplete() {
      await generateProject({
        configPath: options.configPath,
      });
    },
  };
}

export function withNextOpenApi<T extends Record<string, unknown>>(
  nextConfig: T,
  _options: NextOpenApiAdapterOptions = {},
): T {
  return nextConfig;
}
