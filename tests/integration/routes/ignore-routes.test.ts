import path from "path";

import { describe, expect, it } from "vitest";

import { RouteProcessor } from "@next-openapi-gen/routes/route-processor.js";
import type { OpenApiConfig } from "@next-openapi-gen/shared/types.js";
import { copyProjectFixture, getProjectFixturePath } from "../../helpers/test-project.js";

describe("Ignore routes integration", () => {
  const fixturePath = getProjectFixturePath("next", "app-router", "ignore-routes");

  it("excludes routes with @ignore tags", () => {
    const project = copyProjectFixture(fixturePath);

    try {
      const paths = scanFixtureRoutes(project.root);

      expect(paths).toMatchObject({
        "/users": expect.any(Object),
        "/debug": expect.any(Object),
        "/admin/test": expect.any(Object),
        "/public/info": expect.any(Object),
      });
      expect(paths).not.toHaveProperty("/internal");
    } finally {
      project.cleanup();
    }
  });

  it("applies exact and wildcard ignore patterns", () => {
    const project = copyProjectFixture(fixturePath);

    try {
      const paths = scanFixtureRoutes(project.root, {
        ignoreRoutes: ["/debug", "/admin/*"],
      });

      expect(paths).toHaveProperty("/users");
      expect(paths).not.toHaveProperty("/debug");
      expect(paths).not.toHaveProperty("/admin/test");
      expect(paths).not.toHaveProperty("/internal");
    } finally {
      project.cleanup();
    }
  });

  it("combines includeOpenApiRoutes with ignoreRoutes", () => {
    const project = copyProjectFixture(fixturePath);

    try {
      const paths = scanFixtureRoutes(project.root, {
        ignoreRoutes: ["/public/info"],
        includeOpenApiRoutes: true,
      });

      expect(paths).toHaveProperty("/users");
      expect(paths).not.toHaveProperty("/public/info");
      expect(paths).not.toHaveProperty("/debug");
      expect(paths).not.toHaveProperty("/admin/test");
    } finally {
      project.cleanup();
    }
  });
});

function scanFixtureRoutes(projectRoot: string, overrides: Partial<OpenApiConfig> = {}) {
  const apiDir = path.join(projectRoot, "src", "app", "api");
  const routeProcessor = new RouteProcessor({
    apiDir,
    schemaDir: path.join(projectRoot, "src"),
    docsUrl: "api-docs",
    ui: "scalar",
    outputFile: "openapi.json",
    outputDir: path.join(projectRoot, "public"),
    includeOpenApiRoutes: false,
    schemaType: "typescript",
    debug: false,
    ...overrides,
  });

  routeProcessor.scanApiRoutes(apiDir);

  return routeProcessor.getSwaggerPaths();
}
