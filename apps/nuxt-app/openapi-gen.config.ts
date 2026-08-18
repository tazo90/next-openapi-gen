import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.1.0",
  info: {
    title: "Nuxt API",
    version: "1.0.0",
    description: "OpenAPI document generated from nuxt routes.",
  },
  framework: {
    kind: "nuxt",
  },
  apiDir: "./server/api",
  schemaDir: "./server",
  schemaType: "typescript",
  docsUrl: "api-docs",
  ui: "scalar",
  outputDir: "./public",
  outputFile: "openapi.json",
  includeOpenApiRoutes: true,
  debug: false,
});
