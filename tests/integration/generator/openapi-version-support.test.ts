import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OpenApiGenerator } from "next-openapi-gen";

import { createTempProject, writeOpenApiTemplate } from "../../helpers/test-project.js";

describe("OpenAPI version-specific generation", () => {
  it("emits 3.0 and 3.1 schema variants from the same Zod source", () => {
    const project = createTempProject("nxog-openapi-version-support-");

    try {
      const schemaDir = path.join(project.root, "src", "schemas");
      fs.mkdirSync(schemaDir, { recursive: true });
      fs.writeFileSync(
        path.join(schemaDir, "profile.ts"),
        `import { z } from "zod";

export const ProfileSchema = z.object({
  id: z.string().describe("Profile ID"),
  firstName: z.string().nullable().describe("First name"),
  score: z.number().positive().describe("Positive score"),
});
`,
      );

      fs.mkdirSync(path.join(project.root, "src", "app", "api", "profile"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "src", "app", "api", "profile", "route.ts"),
        `/**
 * Profile route
 * @response ProfileSchema
 * @openapi
 */
export async function GET() {
  return Response.json({});
}
`,
      );

      const templatePath = writeOpenApiTemplate(project.root, {
        openapi: "3.0.0",
        apiDir: "./src/app/api",
        schemaDir: "./src/schemas",
        schemaType: "zod",
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const spec30 = new OpenApiGenerator({ templatePath }).generate();
        writeOpenApiTemplate(project.root, {
          openapi: "3.1.0",
          apiDir: "./src/app/api",
          schemaDir: "./src/schemas",
          schemaType: "zod",
        });
        const spec31 = new OpenApiGenerator({ templatePath }).generate();

        expect(spec30.components?.schemas?.ProfileSchema).toMatchObject({
          properties: {
            firstName: {
              type: "string",
              nullable: true,
            },
            score: {
              minimum: 0,
              exclusiveMinimum: true,
            },
          },
        });

        expect(spec31.components?.schemas?.ProfileSchema).toMatchObject({
          properties: {
            firstName: {
              type: ["string", "null"],
            },
            score: {
              exclusiveMinimum: 0,
            },
          },
        });
        expect(spec31.components?.schemas?.ProfileSchema).not.toMatchObject({
          properties: {
            firstName: {
              nullable: true,
            },
            score: {
              minimum: 0,
              exclusiveMinimum: true,
            },
          },
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});
