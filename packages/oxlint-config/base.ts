import { defineConfig, type OxlintConfig } from "oxlint";

import coreConfig from "./core.ts";
import nextConfig from "./next.ts";
import reactConfig from "./react.ts";
import vitestConfig from "./vitest.ts";

const baseConfig = defineConfig({
  extends: [coreConfig, reactConfig, nextConfig, vitestConfig],
}) satisfies OxlintConfig;

export default baseConfig;
