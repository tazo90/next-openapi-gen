import { defineConfig, type OxlintConfig } from "oxlint";

const vitestConfig = defineConfig({
  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx,js,jsx}", "**/__tests__/**/*.{ts,tsx,js,jsx}"],
      plugins: ["vitest"],
    },
    {
      files: ["**/tests/fixtures/**/*.{ts,tsx,js,jsx}", "**/fixtures/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "no-unused-vars": "off",
      },
    },
  ],
}) satisfies OxlintConfig;

export default vitestConfig;
