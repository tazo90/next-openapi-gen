import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";

import { createTempProject, writeOpenApiTemplate } from "../../helpers/test-project.js";

describe("OpenApiGenerator integration flow", () => {
  it("normalizes config, scans routes, processes responses, finalizes the version, and exposes diagnostics", () => {
    const project = createTempProject("nxog-generator-flow-");

    try {
      const routeDir = path.join(project.root, "src", "app", "api", "users", "[id]");
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(
        path.join(routeDir, "route.ts"),
        `
          /**
           * Get user by ID
           * @openapi
           */
          export async function GET() {}

          /**
           * Delete user
           * @openapi
           * @response 204
           */
          export async function DELETE() {}
        `,
      );

      const templatePath = writeOpenApiTemplate(project.root, {
        openapiVersion: "3.2",
        includeOpenApiRoutes: true,
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const generator = new OpenApiGenerator({ templatePath });
        const spec = generator.generate();

        expect(spec.openapi).toBe("3.2.0");
        expect(spec.paths?.["/users/{id}"]?.get).toBeDefined();
        expect(spec.paths?.["/users/{id}"]?.delete?.responses?.["204"]).toEqual({
          description: "No Content",
        });
        expect(generator.getDiagnostics()).toHaveLength(2);
        expect(generator.getDiagnostics()).toSatisfy((diagnostics) =>
          diagnostics.every(
            (diagnostic) =>
              diagnostic.code === "missing-path-params-type" &&
              diagnostic.routePath === "/users/{id}",
          ),
        );
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});
