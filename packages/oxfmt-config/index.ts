import { defineConfig, type OxfmtConfig } from "oxfmt";

const oxfmtConfig = defineConfig({
  sortImports: {
    ignoreCase: true,
    internalPattern: ["@workspace/", "@next-openapi-gen"],
    newlinesBetween: true,
    order: "asc",
  },
  sortPackageJson: {
    sortScripts: true,
  },
  sortTailwindcss: {},
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
