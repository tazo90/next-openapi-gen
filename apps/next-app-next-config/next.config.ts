import type { NextConfig } from "next";

import nextConfig from "@workspace/next-config";
import { withNextOpenApi } from "next-openapi-gen/next";

const config = {
  ...nextConfig,
  experimental: {
    ...nextConfig.experimental,
  },
} satisfies NextConfig;

export default withNextOpenApi(config, {
  configPath: "./next-openapi.config.ts",
});
