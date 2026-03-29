import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.0.0",
  info: {
    title: "Typed Config API",
    version: "1.0.0",
    description: "OpenAPI document discovered from next-openapi.config.ts.",
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
