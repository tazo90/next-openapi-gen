import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const tanstackFixture = getProjectFixturePath("tanstack", "core-flow");
const reactRouterFixture = getProjectFixturePath("react-router", "core-flow");

describe("cross-framework fixture generation", () => {
  it("maps TanStack route files, loaders, actions, and response sets", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: tanstackFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths?.["/users/{id}"]?.get).toMatchObject({
        operationId: "tanstackGetUserById",
        tags: ["Users"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/401",
          },
          "403": {
            $ref: "#/components/responses/403",
          },
        },
      });
      expect(spec.paths?.["/users/{id}"]?.post).toMatchObject({
        operationId: "tanstackUpdateUserById",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateUserInput",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/reports/{reportId}/summary"]?.get).toMatchObject({
        operationId: "tanstackGetReportSummary",
        responses: {
          "400": {
            $ref: "#/components/responses/400",
          },
          "500": {
            $ref: "#/components/responses/500",
          },
        },
      });
      expect(spec.components?.schemas?.ReportSummary).toMatchObject({
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "published"],
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("maps React Router route files, loaders, actions, and response sets", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: reactRouterFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths?.["/projects/{projectId}"]?.get).toMatchObject({
        operationId: "reactRouterGetProjectById",
        tags: ["Projects"],
        parameters: [
          {
            in: "path",
            name: "projectId",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Project",
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/401",
          },
          "403": {
            $ref: "#/components/responses/403",
          },
        },
      });
      expect(spec.paths?.["/projects/{projectId}"]?.post).toMatchObject({
        operationId: "reactRouterUpdateProjectById",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ProjectMutationInput",
              },
            },
          },
        },
      });
      expect(spec.paths?.["/settings/profile"]?.get).toMatchObject({
        operationId: "reactRouterGetProfileSettings",
        responses: {
          "400": {
            $ref: "#/components/responses/400",
          },
          "500": {
            $ref: "#/components/responses/500",
          },
        },
      });
      expect(spec.components?.schemas?.ProfileSettings).toMatchObject({
        type: "object",
        properties: {
          theme: {
            type: "string",
            enum: ["light", "dark"],
          },
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it.each([
    [
      "remix",
      "/api/users/{id}",
      "/api/reports/{reportId}/summary",
      "remixGetUserById",
      "remixUpdateUserById",
      "remixGetReportSummary",
    ],
    [
      "sveltekit",
      "/api/users/{id}",
      "/api/reports/{reportId}/summary",
      "sveltekitGetUserById",
      "sveltekitUpdateUserById",
      "sveltekitGetReportSummary",
    ],
    [
      "nuxt",
      "/users/{id}",
      "/reports/{reportId}/summary",
      "nuxtGetUserById",
      "nuxtUpdateUserById",
      "nuxtGetReportSummary",
    ],
    [
      "astro",
      "/users/{id}",
      "/reports/{reportId}/summary",
      "astroGetUserById",
      "astroUpdateUserById",
      "astroGetReportSummary",
    ],
    [
      "hono",
      "/users/{id}",
      "/reports/{reportId}/summary",
      "honoGetUserById",
      "honoUpdateUserById",
      "honoGetReportSummary",
    ],
    [
      "express",
      "/users/{id}",
      "/reports/{reportId}/summary",
      "expressGetUserById",
      "expressUpdateUserById",
      "expressGetReportSummary",
    ],
  ] as const)(
    "maps %s core-flow users and reports",
    (framework, userPath, reportPath, getUser, updateUser, getReport) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: getProjectFixturePath(framework, "core-flow"),
        openapiVersion: "3.1",
      });

      try {
        expect(spec.paths?.[userPath]?.get).toMatchObject({
          operationId: getUser,
          tags: ["Users"],
        });
        expect(spec.paths?.[userPath]?.post).toMatchObject({
          operationId: updateUser,
        });
        expect(spec.paths?.[reportPath]?.get).toMatchObject({
          operationId: getReport,
        });
        expect(spec.components?.schemas?.User).toBeTruthy();
      } finally {
        project.cleanup();
      }
    },
  );
});
