import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTempProject,
  writeAppRoute,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

async function loadGenerateModule(spinner: {
  start: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();
  vi.doMock("ora", () => ({
    default: vi.fn(() => spinner),
  }));

  return import("@next-openapi-gen/cli/commands/generate.js");
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
});
