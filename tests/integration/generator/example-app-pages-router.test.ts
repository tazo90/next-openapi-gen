import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();
const pagesRouterAppPath = path.join(rootDir, "apps", "next-pages-router");

describe("next-pages-router example app generation", () => {
  it("documents transport routes with plain-text and multipart handlers on one path", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: pagesRouterAppPath,
    });

    try {
      expect(spec.paths?.["/uploads"]?.get).toMatchObject({
        operationId: "get-uploads",
        description: "Returns plain-text upload instructions for Pages Router transport coverage.",
        responses: {
          200: {
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                },
              },
            },
          },
        },
      });
      expect(spec.paths?.["/uploads"]?.post).toMatchObject({
        operationId: "post-uploads",
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                $ref: "#/components/schemas/UploadRequestSchema",
              },
            },
          },
        },
        responses: {
          201: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UploadResponseSchema",
                },
              },
            },
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("documents header, cookie, and fallback error responses on list routes", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: pagesRouterAppPath,
    });

    try {
      expect(spec.paths?.["/users"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "header",
            name: "X-Tenant-Id",
            required: true,
          }),
          expect.objectContaining({
            in: "cookie",
            name: "session",
            required: true,
          }),
          expect.objectContaining({
            in: "cookie",
            name: "locale",
            schema: {
              type: "string",
              enum: ["en", "de", "pl"],
              description: "UI locale",
            },
          }),
        ]),
      );
      expect(spec.paths?.["/users"]?.get?.responses).toMatchObject({
        200: {
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/UserSchema",
                },
              },
            },
          },
        },
        "4XX": {
          description: "Any client error",
        },
        default: {
          description: "Fallback error envelope",
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("documents create responses with Location headers and method-specific product routes", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: pagesRouterAppPath,
    });

    try {
      expect(spec.paths?.["/users"]?.post?.responses?.["201"]).toMatchObject({
        headers: {
          Location: {
            description: "URL of the created user",
            schema: {
              type: "string",
            },
          },
        },
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UserSchema",
            },
          },
        },
      });
      expect(spec.paths?.["/products/{id}"]).toMatchObject({
        get: {
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ProductSchema",
                  },
                },
              },
            },
          },
        },
        put: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateProductSchema",
                },
              },
            },
          },
        },
        delete: {
          responses: {
            204: {
              description: "No Content",
            },
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
