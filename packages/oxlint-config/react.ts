import { defineConfig, type OxlintConfig } from "oxlint";

const reactConfig = defineConfig({
  overrides: [
    {
      files: ["apps/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      plugins: ["react", "jsx-a11y"],
      env: {
        browser: true,
      },
      rules: {
        "react/jsx-filename-extension": "off",
        "react/react-compiler": "error",
        "react/react-in-jsx-scope": "off",
      },
    },
  ],
}) satisfies OxlintConfig;

export default reactConfig;
