import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.0.0",
  info: {
    title: "Next Config Integration API",
    version: "1.0.0",
    description: "OpenAPI document configured through next.config.ts wiring.",
  },
  apiDir: "./src/app/api",
  schemaDir: "./src",
  schemaType: "typescript",
  docsUrl: "api-docs",
  ui: "scalar",
  outputDir: "./public",
  outputFile: "openapi.json",
  includeOpenApiRoutes: false,
  debug: false,
});
