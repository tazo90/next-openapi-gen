import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();
const zodAppPath = path.join(rootDir, "apps", "next-app-zod");

describe("next-app-zod inference smoke", { timeout: 15_000 }, () => {
  it("covers handler inference and the shipped Zod Mini sample route", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: zodAppPath,
    });

    try {
      const organizationIdParam = spec.paths?.[
        "/organizations/{organizationId}"
      ]?.get?.parameters?.find((parameter) => parameter.name === "organizationId");

      expect(organizationIdParam).toMatchObject({
        in: "path",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      });
      expect(spec.paths?.["/users/mini"]?.get).toMatchObject({
        summary: "Get a sample user defined with Zod Mini functional APIs",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MiniUserSchema",
                },
              },
            },
          },
        },
      });
      expect(spec.components?.schemas?.MiniUserSchema).toMatchObject({
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          email: {
            type: "string",
            format: "email",
          },
          displayName: {
            type: "string",
            minLength: 1,
            maxLength: 100,
          },
          bio: {
            type: ["string", "null"],
            maxLength: 280,
          },
        },
        required: ["id", "email", "bio"],
      });
    } finally {
      project.cleanup();
    }
  });
});
