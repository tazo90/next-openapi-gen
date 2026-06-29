import type { UserConfig } from "@commitlint/types";

const config = {
  extends: ["@commitlint/config-conventional"],
} satisfies UserConfig;

export default config;
