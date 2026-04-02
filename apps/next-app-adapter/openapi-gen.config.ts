import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.0.0",
  info: {
    title: "Next Adapter API",
    version: "1.0.0",
    description: "OpenAPI document generated from the Next 16 adapter build hook.",
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
