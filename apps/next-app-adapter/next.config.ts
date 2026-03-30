import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import nextConfig from "@workspace/next-config";

const config = {
  ...nextConfig,
  adapterPath: fileURLToPath(new URL("./next-openapi.adapter.mjs", import.meta.url)),
  experimental: {
    ...nextConfig.experimental,
  },
} satisfies NextConfig;

export default config;
