import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // swagger-ui-react uses still UNSAFE_componentWillReceiveProps
};

export default nextConfig;
