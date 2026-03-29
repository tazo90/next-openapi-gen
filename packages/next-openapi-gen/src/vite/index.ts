import { generateProject } from "../core/generate.js";
import { watchProject } from "../core/watch.js";

export type ViteOpenApiPluginOptions = {
  configPath?: string | undefined;
  watch?: boolean | undefined;
};

export function createViteOpenApiPlugin(options: ViteOpenApiPluginOptions = {}) {
  let stopWatching: (() => void) | undefined;

  return {
    name: "next-openapi-gen",
    async buildStart() {
      await generateProject({
        configPath: options.configPath,
      });
    },
    async configureServer() {
      if (options.watch === false) {
        return;
      }

      stopWatching = await watchProject({
        configPath: options.configPath,
      });
    },
    closeBundle() {
      stopWatching?.();
    },
  };
}
