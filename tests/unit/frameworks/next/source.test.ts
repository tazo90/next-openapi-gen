import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createNextFrameworkSource } from "@workspace/openapi-framework-next/frameworks/next/source.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";

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

  it("does not include parent of apiDir as a scan root when apiDir is a subdirectory", () => {
    const project = createTempProject("nxog-next-framework-subdir-");

    try {
      // createTempProject already creates src/app/api — apiDir is a child of it
      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const source = createNextFrameworkSource({
          apiDir: "./src/app/api/external",
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
            router: "app",
          },
          next: {},
          diagnostics: {
            enabled: true,
          },
          openapiVersion: "3.0",
          debug: false,
        });

        expect(source.getScanRoots()).toEqual(["./src/app/api/external"]);
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });

  it("delegates route scanning helpers to the selected app router strategy", () => {
    const project = createTempProject("nxog-next-framework-app-");

    try {
      const routeFile = path.join(project.root, "src", "app", "api", "posts", "route.ts");
      fs.mkdirSync(path.dirname(routeFile), { recursive: true });
      fs.writeFileSync(
        routeFile,
        `
        /**
         * List posts
         * @openapi
         */
        export async function GET() {}
        `,
      );

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const source = createNextFrameworkSource({
          apiDir: "./src/app/api",
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
            router: "app",
          },
          next: {},
          diagnostics: {
            enabled: true,
          },
          openapiVersion: "3.0",
          debug: false,
        });

        expect(source.shouldProcessFile("route.ts")).toBe(true);
        expect(source.getRoutePath(routeFile)).toBe("/posts");
        expect(source.processFile(routeFile)).toEqual([
          expect.objectContaining({
            method: "GET",
            filePath: routeFile,
            routePath: "/posts",
            dataTypes: expect.objectContaining({
              summary: "List posts",
            }),
          }),
        ]);
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});
