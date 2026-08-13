import fs from "node:fs";
import path from "node:path";

import { OpenApiGenerator } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import {
  createTempProject,
  generateFixtureSpec,
  getProjectFixturePath,
  withProjectCwd,
  writeJsonFile,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe("handler param inference", () => {
  it("infers UUID path parameters from context.params Zod validation", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.1",
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
    } finally {
      project.cleanup();
    }
  });

  it("infers query parameters and request bodies from handler Zod validation", () => {
    const { diagnostics, project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/search"]?.query).toMatchObject({
        parameters: [
          {
            in: "query",
            name: "query",
            required: true,
            schema: {
              type: "string",
              minLength: 1,
            },
          },
          {
            in: "query",
            name: "page",
            required: false,
            schema: {
              type: "integer",
            },
          },
        ],
      });
      expect(spec.paths?.["/search"]?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/SearchRequestBodySchema",
            },
          },
        },
      });
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "inferred-query-params",
            routePath: "/search",
            metadata: {
              schemaName: "SearchQuerySchema",
            },
          }),
          expect.objectContaining({
            code: "inferred-body",
            routePath: "/search",
            metadata: {
              schemaName: "SearchRequestBodySchema",
            },
          }),
        ]),
      );
    } finally {
      project.cleanup();
    }
  });

  it("infers destructured App Router params from handler validation", () => {
    const project = createTempProject("nxog-destructured-params-");

    try {
      writeOpenApiTemplate(project.root, {
        openapi: "3.1.0",
        schemaType: "zod",
      });
      const routeDir = path.join(project.root, "src", "app", "api", "teams", "[organizationId]");
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(
        path.join(routeDir, "route.ts"),
        `import { z } from "zod/v4";

export const OrganizationParamsSchema = z.object({
  organizationId: z.uuid(),
});

export async function GET({ params }: { params: Promise<{ organizationId: string }> }) {
  OrganizationParamsSchema.parse(await params);
  return Response.json({ ok: true });
}
`,
      );

      const { diagnostics, spec } = withProjectCwd(project.root, () => {
        const generator = new OpenApiGenerator({ templatePath: "next.openapi.json" });
        const spec = generator.generate();
        return {
          diagnostics: generator.getDiagnostics(),
          spec,
        };
      });

      const organizationIdParam = spec.paths?.["/teams/{organizationId}"]?.get?.parameters?.find(
        (parameter) => parameter.name === "organizationId",
      );
      expect(organizationIdParam).toMatchObject({
        in: "path",
        schema: {
          type: "string",
          format: "uuid",
        },
      });
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "inferred-path-params",
            routePath: "/teams/{organizationId}",
            metadata: expect.objectContaining({
              schemaName: "OrganizationParamsSchema",
            }),
          }),
        ]),
      );
    } finally {
      project.cleanup();
    }
  });

  it("infers Pages Router params from request query validation", () => {
    const project = createTempProject("nxog-pages-handler-inference-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.1.0",
        info: {
          title: "Pages inference",
          version: "1.0.0",
        },
        apiDir: "./pages/api",
        schemaDir: ".",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        debug: false,
        framework: {
          kind: "nextjs",
          router: "pages",
        },
      });
      const routeDir = path.join(project.root, "pages", "api", "users");
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(
        path.join(routeDir, "[id].ts"),
        `import { z } from "zod/v4";

export const UserIdParamsSchema = z.object({
  id: z.uuid(),
});

/**
 * @method GET
 */
export default function handler(req: { query: unknown }) {
  UserIdParamsSchema.parse(req.query);
}
`,
      );

      const { spec } = withProjectCwd(project.root, () => {
        const generator = new OpenApiGenerator({ templatePath: "next.openapi.json" });
        return {
          spec: generator.generate(),
        };
      });

      expect(spec.paths?.["/users/{id}"]?.get?.parameters?.[0]).toMatchObject({
        in: "path",
        name: "id",
        schema: {
          type: "string",
          format: "uuid",
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
