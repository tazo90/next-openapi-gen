import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");
const pagesRouterCoreFixture = getProjectFixturePath("next", "pages-router", "core-flow");
const mixedSchemasFixture = getProjectFixturePath("next", "app-router", "mixed-schemas");

describe.sequential("OpenApiGenerator integration flow", () => {
  it.each(["3.0", "3.1", "3.2"] as const)(
    "finalizes OpenAPI version %s from fixture templates",
    (openapiVersion) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: appRouterCoreFixture,
        openapiVersion,
      });

      try {
        expect(spec.openapi).toBe(`${openapiVersion}.0`);
      } finally {
        project.cleanup();
      }
    },
  );

  it("scans app router fixtures, applies response config, and exposes diagnostics", () => {
    const { diagnostics, project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
    });

    try {
      expect(spec.paths?.["/users/{id}"]?.get?.security).toEqual([{ BearerAuth: [] }]);
      expect(spec.paths?.["/users/{id}"]?.get).toMatchObject({
        description: "Retrieves a single user",
        summary: "Get user by ID",
        tags: ["Users"],
      });
      expect(spec.paths?.["/users/{id}"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: "query", name: "include" }),
          expect.objectContaining({ in: "query", name: "verbose" }),
          expect.objectContaining({ in: "path", name: "id", required: true }),
        ]),
      );
      expect(spec.paths?.["/users/{id}"]?.get?.responses).toMatchObject({
        200: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UserDetail",
              },
            },
          },
        },
        400: {
          $ref: "#/components/responses/400",
        },
        500: {
          $ref: "#/components/responses/500",
        },
      });
      expect(spec.paths?.["/users/{id}"]?.patch?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateUserBody",
            },
          },
        },
      });
      expect(spec.paths?.["/users/{id}"]?.delete?.responses?.["204"]).toEqual({
        description: "No Content",
      });
      expect(spec.paths?.["/workspaces/{workspaceId}/members/{memberId}"]?.get).toMatchObject({
        operationId: "getWorkspaceMemberProfile",
        description: "Returns the current workspace member profile for admin tooling",
        tags: ["Workspace Members"],
        security: [{ BearerAuth: [] }, { PartnerToken: [] }],
        responses: {
          200: {
            description: "Complete workspace member profile",
          },
        },
      });
      expect(
        spec.paths?.["/workspaces/{workspaceId}/members/{memberId}"]?.patch?.requestBody,
      ).toMatchObject({
        description: "Workspace member role and status updates",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateWorkspaceMemberBody",
            },
          },
        },
      });
      expect(
        spec.paths?.["/workspaces/{workspaceId}/members/{memberId}"]?.patch?.responses,
      ).toMatchObject({
        200: {
          description: "Updated workspace member profile",
        },
        401: { $ref: "#/components/responses/401" },
        403: { $ref: "#/components/responses/403" },
        409: { $ref: "#/components/responses/409" },
        429: {
          description: "Too Many Requests",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RateLimitResponse",
              },
            },
          },
        },
      });
      expect(
        spec.paths?.["/workspaces/{workspaceId}/members/{memberId}"]?.delete?.responses,
      ).toEqual({
        204: {
          description: "Membership removed successfully",
        },
      });
      expect(spec.paths?.["/billing/portal"]?.post).toMatchObject({
        tags: ["Billing"],
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        requestBody: {
          description: "Billing session payload with the return URL",
        },
        responses: {
          201: {
            description: "Billing portal session created",
          },
        },
      });
      expect(spec.paths?.["/me"]?.get).toMatchObject({
        operationId: "getCurrentUser",
        security: [{ SessionCookie: [] }, { BearerAuth: [] }],
        responses: {
          200: {
            description: "Returns the current authenticated user.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CurrentUserResponse",
                },
              },
            },
          },
          401: { $ref: "#/components/responses/401" },
          403: { $ref: "#/components/responses/403" },
        },
      });
      expect(spec.paths?.["/posts/{id}"]?.get?.responses).toMatchObject({
        200: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PostResponse",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/uploads/avatar"]?.post).toMatchObject({
        tags: ["Uploads"],
        requestBody: {
          description: "Multipart form data containing the avatar image and metadata",
          content: {
            "multipart/form-data": {
              schema: {
                $ref: "#/components/schemas/AvatarUploadFormData",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Returns upload confirmation with asset metadata",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UploadedAsset",
                },
              },
            },
          },
          400: { $ref: "#/components/responses/400" },
          401: { $ref: "#/components/responses/401" },
          500: { $ref: "#/components/responses/500" },
        },
      });
      expect(spec.paths?.["/catalog/products"]?.get?.responses).toMatchObject({
        200: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ProductListResponse",
              },
            },
          },
        },
        400: { $ref: "#/components/responses/400" },
        500: { $ref: "#/components/responses/500" },
      });
      expect(spec.paths?.["/legacy/users/{id}"]?.get?.deprecated).toBe(true);
      expect(spec.paths).not.toHaveProperty("/internal/health");
      expect(spec.components?.responses).toMatchObject({
        400: {
          description: "Bad Request",
        },
        401: {
          description: "Unauthorized",
        },
        403: {
          description: "Forbidden",
        },
        409: {
          description: "Conflict",
        },
        429: {
          description: "Too Many Requests",
        },
        500: {
          description: "Internal Server Error",
        },
      });
      expect(spec.components?.schemas).toMatchObject({
        UserDetail: {
          type: "object",
        },
        WorkspaceMemberProfile: {
          type: "object",
        },
        CurrentUserResponse: {
          oneOf: expect.any(Array),
        },
        PostResponse: {
          type: "object",
        },
        UploadedAsset: {
          type: "object",
        },
        ReportSummary: {
          type: "object",
        },
      });
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics).toSatisfy((entries) =>
        entries.every(
          (entry) =>
            entry.code === "missing-path-params-type" && entry.routePath === "/diagnostics/{id}",
        ),
      );

      const pathKeys = Object.keys(spec.paths ?? {});
      expect(pathKeys.indexOf("/reports")).toBeLessThan(pathKeys.indexOf("/reports/{id}/summary"));
    } finally {
      project.cleanup();
    }
  });

  it("supports pages router fixtures with explicit @method blocks", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: pagesRouterCoreFixture,
    });

    try {
      expect(spec.paths?.["/users/{id}"]).toMatchObject({
        get: {
          operationId: "getUserById",
          tags: ["Users"],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Returns the user profile",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/UserSchema",
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ["Users"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            description: "User fields that should be updated",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateUserSchema",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Updated user profile",
            },
          },
        },
        delete: {
          tags: ["Users"],
          responses: {
            204: {
              description: "User removed successfully",
            },
          },
        },
      });
      expect(spec.paths?.["/users/{id}"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: "query", name: "includeAudit" }),
          expect.objectContaining({ in: "path", name: "id" }),
        ]),
      );
    } finally {
      project.cleanup();
    }
  });

  it("combines TypeScript and Zod schemas in a single generated document", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: mixedSchemasFixture,
    });

    try {
      expect(spec.paths?.["/orders"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/PaginatedResponse<Order>",
            },
          },
        },
      });
      expect(spec.paths?.["/users"]?.post?.responses?.["201"]).toMatchObject({
        description: "User created",
      });
      expect(spec.components?.schemas).toMatchObject({
        Order: {
          type: "object",
          properties: {
            totalAmount: {
              type: "number",
            },
          },
        },
        UserSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
            },
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
