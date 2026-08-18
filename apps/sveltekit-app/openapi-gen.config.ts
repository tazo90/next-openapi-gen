import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.1.0",
  info: {
    title: "SvelteKit API",
    version: "1.0.0",
    description: "OpenAPI document generated from sveltekit routes.",
  },
  framework: {
    kind: "sveltekit",
  },
  apiDir: "./src/routes",
  schemaDir: "./src",
  schemaType: "typescript",
  docsUrl: "api-docs",
  ui: "scalar",
  outputDir: "./public",
  outputFile: "openapi.json",
  includeOpenApiRoutes: true,
  debug: false,
});
