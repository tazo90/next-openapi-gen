import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;
import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";
import { normalizeOpenApiConfig } from "@workspace/openapi-core/config/normalize.js";
import { runGenerationOrchestrator } from "@workspace/openapi-core/core/orchestrator.js";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

describe("runGenerationOrchestrator", () => {
  it("runs generation hooks and finalizes the document", () => {
    const project = createTempProject("nxog-orchestrator-");

    try {
      const templatePath = writeOpenApiTemplate(project.root);
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );
      const { config, configLoaded, documentBuilt, result, routesDiscovered } = withProjectCwd(
        project.root,
        () => {
          const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
          const config = normalizeOpenApiConfig(template);
          const configLoaded = vi.fn<MockFn>();
          const routesDiscovered = vi.fn<MockFn>();
          const documentBuilt = vi.fn<MockFn>();
          const adapters = createDefaultGenerationAdapters();

          const result = runGenerationOrchestrator({
            config,
            createFrameworkSource: adapters.createFrameworkSource,
            template,
            hooks: {
              configLoaded,
              routesDiscovered,
              documentBuilt,
            },
          });

          return {
            config,
            result,
            configLoaded,
            routesDiscovered,
            documentBuilt,
          };
        },
      );

      expect(result.document.openapi).toBe("3.0.0");
      expect(result.document.paths).toHaveProperty("/users");
      expect(configLoaded).toHaveBeenCalledWith({ config });
      expect(routesDiscovered).toHaveBeenCalledOnce();
      expect(documentBuilt).toHaveBeenCalledOnce();
    } finally {
      project.cleanup();
    }
  });

  it("derives a default Next.js API server url from apiDir", () => {
    const project = createTempProject("nxog-orchestrator-next-base-");

    try {
      const templatePath = writeOpenApiTemplate(project.root);
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );
      const result = withProjectCwd(project.root, () => {
        const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
        const config = normalizeOpenApiConfig(template);
        const adapters = createDefaultGenerationAdapters();

        return runGenerationOrchestrator({
          config,
          createFrameworkSource: adapters.createFrameworkSource,
          template,
        });
      });

      expect(result.document.servers).toEqual([
        {
          url: "/api",
          description: "API server",
        },
      ]);
    } finally {
      project.cleanup();
    }
  });

  it("merges nested custom OpenAPI fragments into existing path items", () => {
    const project = createTempProject("nxog-orchestrator-fragment-");

    try {
      const fragmentPath = `${project.root}/custom-fragment.json`;
      fs.writeFileSync(
        fragmentPath,
        JSON.stringify({
          paths: {
            "/health": {
              parameters: [{ name: "region", in: "header", schema: { type: "string" } }],
              get: { summary: "Health from fragment" },
            },
          },
        }),
      );
      const templatePath = writeOpenApiTemplate(project.root, {
        schemaFiles: [fragmentPath],
        paths: {
          "/health": {
            parameters: [{ name: "trace", in: "query", schema: { type: "string" } }],
            get: {
              responses: { "200": { description: "ok" } },
            },
          },
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

      const result = withProjectCwd(project.root, () => {
        const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
        const config = normalizeOpenApiConfig(template);
        const adapters = createDefaultGenerationAdapters();
        return runGenerationOrchestrator({
          config,
          createFrameworkSource: adapters.createFrameworkSource,
          template,
        });
      });

      expect(result.document.paths?.["/health"]?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "trace" }),
          expect.objectContaining({ name: "region" }),
        ]),
      );
      expect(result.document.paths?.["/health"]?.get).toMatchObject({
        summary: "Health from fragment",
        responses: { "200": { description: "ok" } },
      });
    } finally {
      project.cleanup();
    }
  });
});
