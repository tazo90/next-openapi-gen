import { defineConfig, type OxlintConfig } from "oxlint";

const coreConfig = defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "import",
    "node",
    "promise",
    "react",
    "react-perf",
  ],
  env: {
    browser: true,
    node: true,
  },
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "off",
    style: "off",
  },
  options: {
    typeAware: true,
  },
  jsPlugins: ["eslint-plugin-turbo"],
  rules: {
    "turbo/no-undeclared-env-vars": "error",
    "no-duplicate-imports": [
      "error",
      {
        allowSeparateTypeImports: true,
      },
    ],
    "no-underscore-dangle": [
      "error",
      {
        allow: ["_exhaustive"],
      },
    ],
    "no-shadow": "off",
    "import/no-unassigned-import": "off",
    "promise/prefer-await-to-then": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-filename-extension": "off",
    "react/jsx-props-no-spreading": "off",
    "react/no-unknown-property": "off",
    "react/only-export-components": "off",
    "react-perf/jsx-no-jsx-as-prop": "off",
    "react-perf/jsx-no-new-array-as-prop": "off",
    "react-perf/jsx-no-new-function-as-prop": "off",
    "react-perf/jsx-no-new-object-as-prop": "off",
    "unicorn/consistent-function-scoping": "off",
    "typescript/await-thenable": "error",
    "typescript/consistent-type-imports": "off",
    "typescript/no-extraneous-class": "off",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": [
      "error",
      {
        checksVoidReturn: {
          attributes: false,
          properties: false,
        },
      },
    ],
    "typescript/no-redundant-type-constituents": "off",
    "typescript/no-unnecessary-type-parameters": "off",
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/only-throw-error": "error",
    "typescript/restrict-template-expressions": "off",
    "typescript/return-await": ["error", "always"],
    "typescript/consistent-return": "off",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/unbound-method": "off",
  },
  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx,js,jsx}", "**/__tests__/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "no-new": "off",
        "no-empty-function": "off",
        "unicorn/consistent-function-scoping": "off",
        "promise/prefer-await-to-then": "off",
        "typescript/consistent-type-imports": "off",
        "typescript/no-extraneous-class": "off",
        "typescript/no-floating-promises": "off",
        "typescript/only-throw-error": "off",
      },
    },
    {
      files: ["scripts/**/*.{ts,mts,js,mjs}", "*.config.{ts,mts,js,mjs}"],
      rules: {
        "typescript/no-floating-promises": "off",
      },
    },
  ],
}) satisfies OxlintConfig;

export default coreConfig;
