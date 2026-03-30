import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FrameworkKind, generateProject } from "next-openapi-gen";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeJsonFile,
} from "../../helpers/test-project.js";

describe("generateProject", () => {
  it("writes the spec and incremental manifest", async () => {
    const project = createTempProject("nxog-core-generate-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
        },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        debug: false,
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 * @response UserList
 */
export async function GET() {}

export type UserList = {
  items: string[];
};
`,
      );

      const { manifestPath, outputPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          outputPath: fs.realpathSync(path.join(project.root, "public", "openapi.json")),
          manifestPath: path.join(project.root, ".openapi-cache", "manifest.json"),
        };
      });

      expect(result.artifacts).toContainEqual({
        kind: "spec",
        path: outputPath,
      });
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        outputFile: string;
      };
      expect(manifest.outputFile).toBe(outputPath);
    } finally {
      project.cleanup();
    }
  });

  it("optionally emits the Next docs page when enabled", async () => {
    const project = createTempProject("nxog-core-generate-docs-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
        },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        debug: false,
        framework: {
          kind: FrameworkKind.Nextjs,
          router: "app",
        },
        docs: {
          enabled: true,
        },
      });
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const { docsPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          docsPath: fs.realpathSync(path.join(project.root, "src", "app", "api-docs", "page.tsx")),
        };
      });

      expect(result.artifacts).toContainEqual(
        expect.objectContaining({
          kind: "docs",
          path: docsPath,
        }),
      );
      expect(fs.existsSync(docsPath)).toBe(true);
    } finally {
      project.cleanup();
    }
  });
});
