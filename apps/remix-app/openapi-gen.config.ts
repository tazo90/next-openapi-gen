import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.1.0",
  info: {
    title: "Remix API",
    version: "1.0.0",
    description: "OpenAPI document generated from remix routes.",
  },
  framework: {
    kind: "remix",
  },
  apiDir: "./app/routes",
  schemaDir: "./app",
  schemaType: "typescript",
  docsUrl: "api-docs",
  ui: "scalar",
  outputDir: "./public",
  outputFile: "openapi.json",
  includeOpenApiRoutes: true,
  debug: false,
});
