import type { NextConfig } from "next";
import { withNextOpenApi } from "next-openapi-gen/next";

import nextConfig from "@workspace/next-config";

const config = {
  ...nextConfig,
  experimental: {
    ...nextConfig.experimental,
  },
} satisfies NextConfig;

export default withNextOpenApi(config, {
  configPath: "./openapi-gen.config.ts",
});
