import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createNextFrameworkSource } from "@next-openapi-gen/frameworks/next/source.js";
import { FrameworkKind } from "@next-openapi-gen/shared/types.js";

import { createTempProject } from "../../../helpers/test-project.js";

describe("NextFrameworkSource", () => {
  it("returns the configured api root and sibling app/api root when both exist", () => {
    const project = createTempProject("nxog-next-framework-");

    try {
      fs.mkdirSync(path.join(project.root, "src", "pages", "api"), { recursive: true });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const source = createNextFrameworkSource({
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
            kind: FrameworkKind.Nextjs,
            router: "pages",
          },
          next: {},
          diagnostics: {
            enabled: true,
          },
          openapiVersion: "3.0",
          debug: false,
        });

        expect(source.getScanRoots()).toEqual([
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
