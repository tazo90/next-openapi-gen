import { defineConfig, type OxlintConfig } from "oxlint";

import baseConfig from "@workspace/oxlint-config";
import { ignorePatterns } from "@workspace/oxlint-config/ignores";

export default defineConfig({
  extends: [baseConfig],
  ignorePatterns,
}) satisfies OxlintConfig;
