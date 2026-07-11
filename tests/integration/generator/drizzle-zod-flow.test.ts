import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const drizzleZodFixture = getProjectFixturePath("next", "app-router", "drizzle-zod-flow");

describe("drizzle-zod fixture generation", () => {
  it("emits Drizzle-derived Zod schemas, path params, and request bodies", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: drizzleZodFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths?.["/posts"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "query",
            name: "published",
            schema: {
              type: "string",
              enum: ["true", "false"],
              description: "Filter by publication status",
            },
            required: false,
          }),
          expect.objectContaining({
            in: "query",
            name: "authorId",
            schema: expect.objectContaining({
              pattern: "^\\d+$",
            }),
            required: false,
          }),
        ]),
      );
      expect(spec.paths?.["/posts"]?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreatePostSchema",
            },
          },
        },
      });
      expect(spec.paths?.["/posts/{id}"]?.patch).toMatchObject({
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "string",
              pattern: "^\\d+$",
              description: "Post ID",
            },
            description: "Post ID",
            example: "123",
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdatePostSchema",
              },
            },
          },
        },
      });
      expect(spec.components?.schemas?.PostResponseSchema).toMatchObject({
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Post title",
          },
          published: {
            type: "boolean",
            description: "Publication status",
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
