export default {
  openapi: "3.0.0",
  info: {
    title: "API Documentation",
    version: "1.0.0",
    description: "This is the OpenAPI specification for your project.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
  apiDir: "./src/app/api",
  schemaDir: "./src",
  docsUrl: "api-docs",
  ui: "swagger",
  outputFile: "swagger.json",
  includeOpenApiRoutes: true,
};