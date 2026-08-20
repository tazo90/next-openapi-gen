import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();

describe.sequential("README-backed generator samples", { timeout: 15_000 }, () => {
  it("covers multipart uploads, custom operation IDs, response sets, and inline @add descriptions from the sample apps", async () => {
    const { project, spec } = await generateProjectSpec({
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
      expect(spec.paths?.["/orders/{id}"]?.delete?.responses).toMatchObject({
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: {
                type: "object",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/users/{id}"]?.delete?.responses).toMatchObject({
        200: {
          description: "Successful response",
          content: {
            "application/json": {
              schema: {
                type: "object",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/extended"]?.post?.requestBody?.description).toBe(
        "Extended schema with base and additional properties",
      );
      expect(spec.components?.schemas?.ExtendedSchema).toBeDefined();
      expect(spec.components?.schemas?.DoubleExtendedSchema).toBeDefined();
      expect(spec.openapi).toBe("3.2.0");
      expect(spec.$self).toBe("https://example.com/openapi/next-app-zod.json");
      expect(spec.paths?.["/events"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "querystring",
            name: "advancedQuery",
          }),
        ]),
      );
      expect(spec.paths?.["/events"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "text/event-stream": {
            itemSchema: {
              $ref: "#/components/schemas/EventChunk",
            },
          },
        },
      });
      expect(spec.paths?.["/integrations/subscribe"]?.post?.callbacks).toMatchObject({
        paymentEvent: {
          "{$request.body#/callbackUrl}": {
            $ref: "#/components/callbacks/SubscriptionEventPayload",
          },
        },
      });
      expect(spec.webhooks?.paymentEvent?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/PaymentEvent",
            },
          },
        },
      });
      expect(spec.paths?.["/organizations/{organizationId}"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "path",
            name: "organizationId",
            schema: {
              type: "string",
              format: "uuid",
            },
          }),
        ]),
      );
    } finally {
      project.cleanup();
    }
  });

  it("covers generic and utility-type README samples from the TypeScript app", async () => {
    const { project, spec } = await generateProjectSpec({
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
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.paths?.["/upload"]?.post?.requestBody).toMatchObject({
        content: {
          "multipart/form-data": {
            schema: {
              $ref: "#/components/schemas/UploadFormData",
            },
          },
        },
      });
      expect(
        spec.paths?.["/organizations/{orgId}/projects/{projectId}/tasks/{taskId}/comments"]?.get
          ?.parameters,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            in: "path",
            name: "orgId",
          }),
          expect.objectContaining({
            in: "path",
            name: "projectId",
          }),
          expect.objectContaining({
            in: "path",
            name: "taskId",
          }),
          expect.objectContaining({
            in: "query",
            name: "sort",
            schema: {
              type: "string",
              enum: ["newest", "oldest", "likes"],
              description: "Sort order",
            },
          }),
        ]),
      );
    } finally {
      project.cleanup();
    }
  });

  it("covers @queryParams alias and combined response-set examples from the sandbox app", async () => {
    const { project, spec } = await generateProjectSpec({
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

  it("covers mixed schema backends plus schemaFiles from the README-style mixed app", async () => {
    const { project, spec } = await generateProjectSpec({
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
      expect(spec.openapi).toBe("3.2.0");
      expect(spec.webhooks?.integrationEvent?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/WebhookEnvelope",
            },
          },
        },
      });
      expect(spec.paths?.["/integrations/webhooks"]?.post).toMatchObject({
        operationId: "mixedRegisterWebhookEndpoint",
        callbacks: expect.any(Object),
      });
      expect(spec.paths?.["/integrations/webhooks/deliveries/{deliveryId}"]?.get).toMatchObject({
        operationId: "mixedGetWebhookDelivery",
        parameters: [
          {
            in: "path",
            name: "deliveryId",
            required: true,
            schema: {
              type: "string",
              description: "Delivery attempt identifier",
            },
            description: "Delivery attempt identifier",
            example: "123",
          },
        ],
      });
    } finally {
      project.cleanup();
    }
  });

  it("covers the Drizzle-Zod README sample through full document generation", async () => {
    const { project, spec } = await generateProjectSpec({
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

  it("covers TanStack and React Router sample-app route mapping and multipart actions", async () => {
    const tanstack = await generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "tanstack-app"),
    });
    const reactRouter = await generateProjectSpec({
      projectPath: path.join(rootDir, "apps", "react-router-app"),
    });

    try {
      expect(tanstack.spec.paths?.["/reports/{reportId}/summary"]?.get).toMatchObject({
        operationId: "tanstackGetReportSummary",
        parameters: [
          {
            in: "path",
            name: "reportId",
            required: true,
            schema: {
              type: "string",
            },
            example: "123",
          },
        ],
      });
      expect(tanstack.spec.paths?.["/uploads"]?.post).toMatchObject({
        operationId: "tanstackCreateUpload",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                $ref: "#/components/schemas/AssetUploadInput",
              },
            },
          },
        },
      });
      expect(reactRouter.spec.paths?.["/projects/{projectId}"]?.get).toMatchObject({
        operationId: "reactRouterGetProjectById",
        tags: ["Projects", "Workspace"],
      });
      expect(reactRouter.spec.paths?.["/uploads"]?.post).toMatchObject({
        operationId: "reactRouterCreateUpload",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                $ref: "#/components/schemas/UploadDraft",
              },
            },
          },
        },
      });
    } finally {
      tanstack.project.cleanup();
      reactRouter.project.cleanup();
    }
  });
});
