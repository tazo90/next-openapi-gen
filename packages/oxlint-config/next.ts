import { defineConfig, type OxlintConfig } from "oxlint";

const nextConfig = defineConfig({
  plugins: ["nextjs"],
  settings: {
    next: {
      rootDir: [
        "apps/next-app-adapter",
        "apps/next-app-drizzle-zod",
        "apps/next-app-mixed-schemas",
        "apps/next-app-next-config",
        "apps/next-app-sandbox",
        "apps/next-app-scalar",
        "apps/next-app-swagger",
        "apps/next-app-ts-config",
        "apps/next-app-typescript",
        "apps/next-app-zod",
        "apps/next-pages-router",
      ],
    },
  },
  overrides: [
    {
      files: [
        "**/src/app/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/pages/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/src/schemas/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/src/types/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      ],
      rules: {
        "no-unused-vars": "off",
      },
    },
  ],
}) satisfies OxlintConfig;

export default nextConfig;
