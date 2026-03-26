import type { NextConfig } from "next";

const transpilePackages = [];

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  transpilePackages,
  experimental: {
    prefetchInlining: true,
    appNewScrollHandler: true,
    cachedNavigations: true,
    authInterrupts: true,
    rootParams: true,
    typedEnv: true,
    turbopackFileSystemCacheForBuild: true,
    viewTransition: true,
    webVitalsAttribution: ["CLS", "LCP"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
} satisfies NextConfig;

export { transpilePackages };

export default nextConfig;
