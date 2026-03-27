import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createNextFrameworkAdapter } from "@next-openapi-gen/frameworks/next/adapter.js";

import { createTempProject } from "../../helpers/test-project.js";

describe("NextFrameworkAdapter", () => {
  it("returns the configured api root and sibling app/api root when both exist", () => {
    const project = createTempProject("nxog-next-framework-");

    try {
      fs.mkdirSync(path.join(project.root, "src", "pages", "api"), { recursive: true });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const adapter = createNextFrameworkAdapter({
          apiDir: "./src/pages/api",
          routerType: "pages",
          schemaDir: "./src",
          docsUrl: "api-docs",
          ui: "scalar",
          outputFile: "openapi.json",
          outputDir: "./public",
          includeOpenApiRoutes: false,
          ignoreRoutes: [],
          schemaType: "typescript",
          schemaBackends: ["typescript"],
          schemaFiles: [],
          framework: {
            kind: "next",
            router: "pages",
          },
          next: {},
          diagnostics: {
            enabled: true,
          },
          openapiVersion: "3.0",
          debug: false,
        });

        expect(adapter.getScanRoots()).toEqual([
          "./src/pages/api",
          fs.realpathSync(path.join(project.root, "src", "app", "api")),
        ]);
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});
