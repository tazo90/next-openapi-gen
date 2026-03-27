import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";

import {
  createTempProject,
  generateFixtureSpec,
  getProjectFixturePath,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

const appRouterZodCoverageFixture = getProjectFixturePath(
  "next",
  "app-router",
  "zod-only-coverage",
);
const pagesRouterZodFixture = getProjectFixturePath("next", "pages-router", "zod-flow");

describe("Zod 4 generator coverage", () => {
  it("preserves Zod 4 helper formats, query param fidelity, and avoids duplicate inferred aliases", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterZodCoverageFixture,
    });

    try {
      expect(spec.paths?.["/auth/login"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "query",
            name: "provider",
            required: true,
            schema: {
              $ref: "#/components/schemas/ProviderSchema",
            },
          }),
          expect.objectContaining({
            in: "query",
            name: "next",
            required: false,
            schema: {
              allOf: [{ $ref: "#/components/schemas/SafeRedirectPathSchema" }],
            },
          }),
        ]),
      );

      expect(spec.components?.schemas?.AuthUserSchema).toMatchObject({
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          email: {
            type: "string",
            format: "email",
            nullable: true,
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          lastSignInAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          website: {
            type: "string",
            format: "uri",
          },
        },
      });
      expect(spec.components?.schemas).toHaveProperty("LoginResponseSchema");
      expect(spec.components?.schemas).not.toHaveProperty("LoginResponse");
    } finally {
      project.cleanup();
    }
  });

  it("upgrades nullable Zod 4 helpers for OpenAPI 3.1 output", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterZodCoverageFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.components?.schemas?.AuthUserSchema).toMatchObject({
        properties: {
          email: {
            type: ["string", "null"],
            format: "email",
          },
          lastSignInAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("supports Pages Router fixtures that import z from zod/v4", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: pagesRouterZodFixture,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/me"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CurrentUserSchema",
            },
          },
        },
      });
      expect(spec.components?.schemas?.CurrentUserSchema).toMatchObject({
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          email: {
            type: "string",
            format: "email",
          },
          homepage: {
            type: "string",
            format: "uri",
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("still emits an inferred alias component when the alias is explicitly referenced", () => {
    const project = createTempProject("nxog-zod-explicit-alias-");

    try {
      const schemaDir = path.join(project.root, "src", "schemas");
      fs.mkdirSync(schemaDir, { recursive: true });
      fs.writeFileSync(
        path.join(schemaDir, "auth.ts"),
        `import { z } from "zod/v4";

export const LoginResponseSchema = z.object({
  id: z.uuid(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
`,
      );

      fs.mkdirSync(path.join(project.root, "src", "app", "api", "auth", "session"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(project.root, "src", "app", "api", "auth", "session", "route.ts"),
        `/**
 * @response LoginResponse
 * @openapi
 */
export async function GET() {
  return Response.json({});
}
`,
      );

      const templatePath = writeOpenApiTemplate(project.root, {
        schemaDir: "./src/schemas",
        schemaType: "zod",
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const spec = new OpenApiGenerator({ templatePath }).generate();

        expect(spec.paths?.["/auth/session"]?.get?.responses?.["200"]).toMatchObject({
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginResponse",
              },
            },
          },
        });
        expect(spec.components?.schemas?.LoginResponse).toMatchObject({
          properties: {
            id: {
              type: "string",
              format: "uuid",
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
