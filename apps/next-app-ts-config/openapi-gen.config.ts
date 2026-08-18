import { defineConfig } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.0.0",
  info: {
    title: "Typed Config API",
    version: "1.0.0",
    description: "OpenAPI document discovered from openapi-gen.config.ts.",
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
  clientSdk: [
    {
      name: "typescript-fetch",
      command: "node",
      args: ["./scripts/generate-typescript-client.mjs"],
      outputDir: "./src/generated/api",
      enabled: process.env.GENERATE_CLIENT_SDK === "1",
    },
  ],
});
