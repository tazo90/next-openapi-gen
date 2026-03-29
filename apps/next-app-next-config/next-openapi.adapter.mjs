import { createNextOpenApiAdapter } from "next-openapi-gen/next";

export default createNextOpenApiAdapter({
  configPath: "./next-openapi.config.ts",
});
