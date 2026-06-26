import { defineConfig, type OxfmtConfig } from "oxfmt";

import baseConfig from "@workspace/oxfmt-config";
import { ignorePatterns } from "@workspace/oxlint-config/ignores";

export default defineConfig({
  ...baseConfig,
  ignorePatterns,
}) satisfies OxfmtConfig;
