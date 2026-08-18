import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();
const typescriptAppPath = path.join(rootDir, "apps", "next-app-typescript");

describe("next-app-typescript transport and session generation", () => {
  it("documents CSV export downloads with explicit media types and response sets", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: typescriptAppPath,
    });

    try {
      expect(spec.paths?.["/exports/{exportId}"]?.get).toMatchObject({
        operationId: "typescriptDownloadExport",
        tags: ["Exports"],
        parameters: expect.arrayContaining([
          expect.objectContaining({
            in: "path",
            name: "exportId",
          }),
          expect.objectContaining({
            in: "query",
            name: "format",
            schema: {
              type: "string",
              enum: ["csv", "ndjson"],
            },
          }),
        ]),
        responses: {
          200: {
            content: {
              "text/csv": {
                schema: {
                  $ref: "#/components/schemas/CsvExportBody",
                },
              },
            },
          },
          400: { $ref: "#/components/responses/400" },
          500: { $ref: "#/components/responses/500" },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("documents redirect transport routes without JSON response bodies", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: typescriptAppPath,
    });

    try {
      expect(spec.paths?.["/exports/{exportId}/latest"]?.get).toMatchObject({
        operationId: "typescriptRedirectLatestExport",
        description: "Demonstrates redirect-style transport routes from typed route modules.",
        responses: {
          307: {
            description: "Successful response",
          },
          400: { $ref: "#/components/responses/400" },
          500: { $ref: "#/components/responses/500" },
        },
      });
      expect(
        spec.paths?.["/exports/{exportId}/latest"]?.get?.responses?.["307"],
      ).not.toHaveProperty("content");
    } finally {
      project.cleanup();
    }
  });

  it("documents generic session envelopes with alternative security requirements", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: typescriptAppPath,
    });

    try {
      expect(spec.paths?.["/sessions/{sessionId}"]?.get).toMatchObject({
        operationId: "typescriptGetSession",
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        responses: {
          200: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SessionEnvelope",
                },
              },
            },
          },
        },
      });
      expect(spec.paths?.["/sessions/{sessionId}"]?.patch).toMatchObject({
        operationId: "typescriptUpdateSession",
        security: [{ BearerAuth: [] }, { PartnerToken: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SessionActionInput",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/sessions/{sessionId}"]?.delete).toMatchObject({
        operationId: "typescriptDeleteSession",
        responses: {
          204: {
            description: "No Content",
          },
        },
      });
      expect(spec.components?.schemas?.SessionEnvelope).toMatchObject({
        type: "object",
        properties: {
          data: {
            properties: {
              authChannel: {
                enum: ["bearer", "header", "cookie"],
              },
            },
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("documents ReturnType-derived create product responses from utility types", async () => {
    const { project, spec } = await generateProjectSpec({
      projectPath: typescriptAppPath,
    });

    try {
      expect(spec.paths?.["/products"]?.post).toMatchObject({
        description: "Demonstrates ReturnType and Parameters utility types",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateProductApiResponse",
                },
              },
            },
            headers: {
              "X-Request-Id": {
                description: "Trace identifier",
              },
            },
          },
          "4XX": {
            description: "Any client error",
          },
          default: {
            description: "Fallback error envelope",
          },
        },
      });
      expect(spec.components?.schemas?.CreateProductApiResponse).toBeDefined();
      expect(spec.components?.schemas?.CreateProductRequest).toBeDefined();
    } finally {
      project.cleanup();
    }
  });
});
