import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { OpenApiTemplate } from "@next-openapi-gen/types.js";

export function createTempProject(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  fs.mkdirSync(path.join(root, "src", "app", "api"), { recursive: true });

  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function writeOpenApiTemplate(projectRoot: string, template: Partial<OpenApiTemplate> = {}) {
  const filePath = path.join(projectRoot, "next.openapi.json");

  writeJsonFile(filePath, {
    openapi: "3.0.0",
    info: {
      title: "API Documentation",
      version: "1.0.0",
      description: "Fixture template",
    },
    apiDir: "./src/app/api",
    schemaDir: "./src",
    schemaType: "zod",
    outputDir: "./public",
    outputFile: "openapi.json",
    docsUrl: "api-docs",
    ui: "scalar",
    includeOpenApiRoutes: false,
    ignoreRoutes: [],
    debug: false,
    ...template,
  });

  return filePath;
}

export function writeAppRoute(projectRoot: string, routeSegments: string[], fileContents: string) {
  const routeDir = path.join(projectRoot, "src", "app", "api", ...routeSegments);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "route.ts"), fileContents);
}
