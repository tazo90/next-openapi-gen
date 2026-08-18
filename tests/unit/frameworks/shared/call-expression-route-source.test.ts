import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CallExpressionRouteSource,
  convertCallExpressionPath,
} from "@workspace/openapi-core/frameworks/shared/call-expression-route-source.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import type { ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";

describe("CallExpressionRouteSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
  });

  it("discovers Hono method calls, on(), basePath, and imported mounts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-call-hono-"));
    tempDirs.push(tempDir);
    const appPath = path.join(tempDir, "app.ts");
    const usersPath = path.join(tempDir, "users.ts");
    fs.writeFileSync(
      usersPath,
      `import { Hono } from "hono";
const users = new Hono();
/** @openapi */
users.get("/:id", (c) => c.json({ id: c.req.param("id") }));
export { users };
`,
    );
    fs.writeFileSync(
      appPath,
      `import { Hono } from "hono";
import { users } from "./users";
const app = new Hono().basePath("/api");
/** List health */
app.get("/health", (c) => c.json({ ok: true }));
app.on("PUT", "/items/:id", (c) => c.json({ id: c.req.param("id") }));
app.on(["PATCH"], "/items/:id", () => undefined);
app.route("/users", users);
export default app;
`,
    );

    const source = new CallExpressionRouteSource(
      createConfig(tempDir, {
        kind: FrameworkKind.Hono,
        modulePath: appPath,
      }),
    );

    expect(source.shouldProcessFile("app.ts")).toBe(true);
    expect(source.shouldProcessFile("users.ts")).toBe(false);
    expect(source.precheckFile(appPath)).toBe(true);
    expect(source.getRoutePath(appPath)).toBe("/app");
    expect(convertCallExpressionPath("users/:id?")).toBe("/users/{id}");

    const routes = source.processFile(appPath);
    expect(routes.map((route) => `${route.method} ${route.routePath}`).toSorted()).toEqual([
      "GET /api/health",
      "GET /api/users/{id}",
      "PATCH /api/items/{id}",
      "PUT /api/items/{id}",
    ]);
  });

  it("discovers Express route chains and use() mounts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-call-express-"));
    tempDirs.push(tempDir);
    const projectsPath = path.join(tempDir, "projects.ts");
    const appPath = path.join(tempDir, "index.ts");
    fs.writeFileSync(
      projectsPath,
      `import { Router } from "express";
export const projects = Router();
projects.route("/:projectId").get(() => undefined).post(() => undefined);
`,
    );
    fs.writeFileSync(
      appPath,
      `import express from "express";
import { projects } from "./projects";
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/projects", projects);
export default app;
`,
    );

    const source = new CallExpressionRouteSource(
      createConfig(tempDir, {
        kind: FrameworkKind.Express,
        modulePath: appPath,
      }),
    );

    expect(
      source
        .processFile(appPath)
        .map((route) => `${route.method} ${route.routePath}`)
        .toSorted(),
    ).toEqual(["GET /health", "GET /projects/{projectId}", "POST /projects/{projectId}"]);
  });

  it("reads JSDoc from the enclosing statement when includeOpenApiRoutes is on", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-call-jsdoc-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "app.ts");
    fs.writeFileSync(
      filePath,
      `const app = { get() {} };

/**
 * Documented user route.
 * @operationId documentedGetUser
 * @openapi
 */
app.get("/users/:id", () => undefined);

app.get("/hidden", () => undefined);
`,
    );

    const source = new CallExpressionRouteSource(
      createConfig(tempDir, { kind: FrameworkKind.Hono }, { includeOpenApiRoutes: true }),
    );

    const routes = source.processFile(filePath);
    expect(routes.map((route) => `${route.method} ${route.routePath}`).toSorted()).toEqual([
      "GET /hidden",
      "GET /users/{id}",
    ]);
    expect(routes.find((route) => route.routePath === "/users/{id}")?.dataTypes.isOpenApi).toBe(
      true,
    );
    expect(routes.find((route) => route.routePath === "/hidden")?.dataTypes.isOpenApi).toBe(false);
  });

  it("skips unmarked OpenAPI routes and files outside the scan root", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-call-edges-"));
    tempDirs.push(tempDir);
    const apiDir = path.join(tempDir, "src");
    fs.mkdirSync(apiDir);
    const filePath = path.join(apiDir, "app.ts");
    fs.writeFileSync(filePath, `const app = { get() {} };\napp.get("/plain", () => undefined);\n`);

    const source = new CallExpressionRouteSource(
      createConfig(apiDir, { kind: FrameworkKind.Hono }, { includeOpenApiRoutes: true }),
    );

    expect(source.precheckFile(filePath)).toBe(false);
    expect(source.getRoutePath(path.join(tempDir, "outside.ts"))).toBe("/");
    expect(source.shouldProcessFile("notes.md")).toBe(false);
    expect(source.processFile(path.join(tempDir, "missing.ts"))).toEqual([]);
  });
});

function createConfig(
  apiDir: string,
  framework: ResolvedOpenApiConfig["framework"],
  overrides: Partial<ResolvedOpenApiConfig> = {},
): ResolvedOpenApiConfig {
  return {
    apiDir,
    routerType: "app",
    schemaDir: apiDir,
    docsUrl: "api-docs",
    ui: "scalar",
    outputFile: "openapi.json",
    outputDir: "./public",
    includeOpenApiRoutes: false,
    ignoreRoutes: [],
    schemaType: "typescript",
    schemaBackends: ["typescript"],
    schemaFiles: [],
    framework,
    next: {},
    diagnostics: { enabled: true },
    openapiVersion: "3.1",
    debug: false,
    ...overrides,
  };
}
