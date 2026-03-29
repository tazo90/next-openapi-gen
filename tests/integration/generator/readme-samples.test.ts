import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();

describe.sequential("README-backed generator samples", () => {
  it("covers multipart uploads, custom operation IDs, response sets, and inline @add descriptions from the sample apps", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "next-app-zod"),
    });

    try {
      expect(spec.paths?.["/upload"]?.post).toMatchObject({
        tags: ["Uploads"],
        requestBody: {
          description:
            "Multipart form data containing image file (PNG/JPG, max 5MB), optional description and category",
          content: {
            "multipart/form-data": {
              schema: {
                $ref: "#/components/schemas/UploadFormDataSchema",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Returns upload confirmation with file metadata and access URL",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UploadResponseSchema",
                },
              },
            },
          },
          400: { $ref: "#/components/responses/400" },
          500: { $ref: "#/components/responses/500" },
        },
      });
      expect(spec.paths?.["/orders"]?.get).toMatchObject({
        operationId: "getOrdersList",
        security: [{ BearerAuth: [] }],
      });
      expect(spec.paths?.["/orders"]?.post).toMatchObject({
        operationId: "createOrder",
        security: [{ BearerAuth: [] }],
      });
      expect(spec.paths?.["/users"]?.get?.responses).toMatchObject({
        400: { $ref: "#/components/responses/400" },
        401: { $ref: "#/components/responses/401" },
        500: { $ref: "#/components/responses/500" },
      });
      expect(spec.paths?.["/notifications"]?.post?.responses).toMatchObject({
        201: {
          description: "Notification sent successfully",
        },
        400: {
          description: "Invalid notification data or validation failed",
        },
        429: {
          description: "Rate limit exceeded",
        },
      });
      expect(spec.paths?.["/extended"]?.post?.requestBody?.description).toBe(
        "Extended schema with base and additional properties",
      );
      expect(spec.components?.schemas?.ExtendedSchema).toBeDefined();
      expect(spec.components?.schemas?.DoubleExtendedSchema).toBeDefined();
    } finally {
      project.cleanup();
    }
  });

  it("covers generic and utility-type README samples from the TypeScript app", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "next-app-typescript"),
    });

    try {
      expect(spec.paths?.["/llms"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/MyApiSuccessResponseBody<LLMSResponse>",
            },
          },
        },
      });
      expect(spec.components?.schemas?.["MyApiSuccessResponseBody<LLMSResponse>"]).toBeDefined();
      expect(spec.paths?.["/products/{id}"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ProductByIdResponse",
            },
          },
        },
      });
      expect(spec.paths?.["/products/{id}/summary"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ProductSummaryResponse",
            },
          },
        },
      });
      expect(spec.paths?.["/reports"]?.get?.security).toEqual([
        { BearerAuth: [] },
        { ApiKeyAuth: [] },
      ]);
      expect(spec.paths?.["/reports"]?.post?.security).toEqual([
        { BearerAuth: [] },
        { PartnerToken: [] },
      ]);
    } finally {
      project.cleanup();
    }
  });

  it("covers @queryParams alias and combined response-set examples from the sandbox app", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "next-app-sandbox"),
    });

    try {
      expect(spec.paths?.["/test-query-params"]?.get).toMatchObject({
        description:
          "Test endpoint to verify @queryParams works (to avoid prettier-plugin-jsdoc conflicts)",
      });
      expect(spec.paths?.["/test-query-params"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: "query", name: "q" }),
          expect.objectContaining({ in: "query", name: "page" }),
          expect.objectContaining({ in: "query", name: "limit" }),
          expect.objectContaining({ in: "query", name: "sort" }),
        ]),
      );
      expect(spec.paths?.["/users/{id}"]?.get?.responses).toMatchObject({
        400: { $ref: "#/components/responses/400" },
        401: { $ref: "#/components/responses/401" },
        409: { $ref: "#/components/responses/409" },
        500: { $ref: "#/components/responses/500" },
      });
    } finally {
      project.cleanup();
    }
  });

  it("covers mixed schema backends plus schemaFiles from the README-style mixed app", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "next-app-mixed-schemas"),
    });

    try {
      expect(spec.paths?.["/users"]?.post?.responses?.["201"]).toMatchObject({
        description: "User created successfully",
      });
      expect(spec.components?.schemas?.Role).toMatchObject({
        type: "object",
        description: "User role definition from protobuf",
      });
      expect(spec.components?.schemas?.Permission).toBeDefined();
    } finally {
      project.cleanup();
    }
  });

  it("covers the Drizzle-Zod README sample through full document generation", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "next-app-drizzle-zod"),
    });

    try {
      expect(spec.paths?.["/posts"]?.post).toMatchObject({
        tags: ["Posts"],
        requestBody: {
          description: "Post data including title, content, and author",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreatePostSchema",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Post created successfully",
          },
        },
      });
      expect(spec.paths?.["/posts"]?.get?.responses).toMatchObject({
        200: {
          description: "List of blog posts",
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
