import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;
import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";

import { runGenerationOrchestrator } from "@workspace/openapi-core/core/orchestrator.js";
import { normalizeOpenApiConfig } from "@workspace/openapi-core/config/normalize.js";

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
});
