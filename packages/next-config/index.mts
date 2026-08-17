import type { NextConfig } from "next";

const transpilePackages: string[] = [];

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  agentRules: false,
  transpilePackages,
  experimental: {
    cachedNavigations: true,
    authInterrupts: true,
    typedEnv: true,
    // TypeScript 6 is catalog-aliased as @typescript/typescript6 and ships `tsc6`, not `tsc`.
    useTypeScriptCli: false,
    webVitalsAttribution: ["CLS", "LCP"],
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
} satisfies NextConfig;

export { transpilePackages };

export default nextConfig;
