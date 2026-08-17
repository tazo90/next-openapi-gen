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
    // TypeScript 7 has no JavaScript compiler API; Next needs the project-local `tsc`.
    useTypeScriptCli: true,
    webVitalsAttribution: ["CLS", "LCP"],
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
} satisfies NextConfig;

export { transpilePackages };

export default nextConfig;
