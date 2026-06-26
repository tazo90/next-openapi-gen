import { defineConfig, type OxfmtConfig } from "oxfmt";

const oxfmtConfig = defineConfig({
  printWidth: 100,
  sortImports: {
    ignoreCase: true,
    internalPattern: ["@workspace/", "@next-openapi-gen"],
    newlinesBetween: true,
    order: "asc",
  },
  sortPackageJson: {
    sortScripts: true,
  },
  overrides: [
    {
      files: ["**/*.md"],
      options: {
        printWidth: 280,
      },
    },
  ],
}) satisfies OxfmtConfig;

export default oxfmtConfig;
