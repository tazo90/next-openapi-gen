import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTempProject,
  writeAppRoute,
  writeOpenApiTemplate,
} from "../../../helpers/test-project.js";

async function loadGenerateModule(
  spinner: {
    start: ReturnType<typeof vi.fn>;
    succeed: ReturnType<typeof vi.fn>;
    fail?: ReturnType<typeof vi.fn>;
  },
  setupMocks?: () => void,
) {
  vi.resetModules();
  vi.doMock("ora", () => ({
    default: vi.fn(() => spinner),
  }));
  setupMocks?.();

  return import("@workspace/openapi-cli/cli/commands/generate.js");
}

describe("generate command", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("writes an OpenAPI document using the configured output path", async () => {
    const project = createTempProject("nxog-generate-");
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    };

    try {
      writeOpenApiTemplate(project.root);
      writeAppRoute(
        project.root,
        ["users"],
        `import { z } from "zod";

export const UsersResponse = z.object({
  items: z.array(z.object({ id: z.string() })),
});

/**
 * List users
 * @openapi
 * @response UsersResponse
 */
export async function GET() {}
`,
      );

      process.chdir(project.root);

      const { generate } = await loadGenerateModule(spinner);

      await generate({ template: "next.openapi.json" });

      const outputPath = path.join(project.root, "public", "openapi.json");
      const spec = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
        info: { title: string };
        paths: Record<string, Record<string, { operationId: string }>>;
        components: { schemas: Record<string, unknown> };
      };

      expect(spec.info.title).toBe("API Documentation");
      expect(spec.paths["/users"]?.get?.operationId).toBe("get-users");
      expect(spec.components.schemas).toHaveProperty("UsersResponse");
    } finally {
      project.cleanup();
    }
  });

  it("uses the default template path when no template option is provided", async () => {
    const project = createTempProject("nxog-generate-default-template-");
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    };

    try {
      writeOpenApiTemplate(project.root);
      process.chdir(project.root);

      const { generate } = await loadGenerateModule(spinner);

      await generate({});

      expect(fs.existsSync(path.join(project.root, "public", "openapi.json"))).toBe(true);
    } finally {
      project.cleanup();
    }
  });

  it("discovers typed config files when no template option is provided", async () => {
    const project = createTempProject("nxog-generate-typed-config-");
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    };

    try {
      fs.writeFileSync(
        path.join(project.root, "next-openapi.config.js"),
        `export default {
          openapi: "3.0.0",
          info: {
            title: "Typed Config",
            version: "1.0.0"
          },
          apiDir: "./src/app/api",
          schemaDir: "./src",
          schemaType: "typescript",
          docsUrl: "api-docs",
          ui: "scalar",
          outputDir: "./public",
          outputFile: "openapi.json",
          includeOpenApiRoutes: false,
          debug: false
        };`,
      );
      writeAppRoute(
        project.root,
        ["orders"],
        `export type OrderResponse = {
  id: string;
};

/**
 * List orders
 * @openapi
 * @response OrderResponse
 */
export async function GET() {}`,
      );
      process.chdir(project.root);

      const { generate } = await loadGenerateModule(spinner);

      await generate({});

      const outputPath = path.join(project.root, "public", "openapi.json");
      const spec = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
        info: { title: string };
        paths: Record<string, Record<string, { operationId: string }>>;
      };

      expect(spec.info.title).toBe("Typed Config");
      expect(spec.paths["/orders"]?.get?.operationId).toBe("get-orders");
    } finally {
      project.cleanup();
    }
  });

  it("propagates generation errors before reporting success", async () => {
    const project = createTempProject("nxog-generate-missing-template-");
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };

    try {
      process.chdir(project.root);

      const { generate } = await loadGenerateModule(spinner);

      await expect(generate({ template: "missing.openapi.json" })).rejects.toThrow(
        "Config file not found",
      );
      expect(spinner.succeed).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("starts the watcher when watch mode is enabled", async () => {
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      info: vi.fn(),
    };
    const generateProject = vi.fn(async () => ({
      artifacts: [],
      outputFile: "/tmp/openapi.json",
    }));
    const watchProject = vi.fn(async () => vi.fn());

    const { generate } = await loadGenerateModule(spinner, () => {
      vi.doMock("@workspace/openapi-core", () => ({
        generateProject,
        watchProject,
      }));
    });

    await generate({
      config: "openapi-gen.config.ts",
      watch: true,
    });

    expect(generateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
      }),
    );
    expect(watchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
      }),
    );
  });
});
