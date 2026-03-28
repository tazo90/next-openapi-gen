export type E2EAppName =
  | "next-app-zod"
  | "next-app-typescript"
  | "next-app-scalar"
  | "next-app-swagger"
  | "next-app-sandbox"
  | "next-app-drizzle-zod"
  | "next-pages-router"
  | "next-app-mixed-schemas";

export type E2EAppConfig = {
  name: E2EAppName;
  appDir: string;
  docsPath: string;
  docsSelector?: string;
  docsText: string[];
  openApiFile: string;
  openApiPaths: string[];
  port: number;
  title: string;
};

const DEFAULT_E2E_APP_NAME: E2EAppName = "next-app-zod";

const E2E_APPS: readonly E2EAppConfig[] = [
  {
    name: "next-app-zod",
    appDir: "apps/next-app-zod",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-zod/public/openapi.json",
    openApiPaths: [],
    port: 3100,
    title: "API Documentation",
  },
  {
    name: "next-app-typescript",
    appDir: "apps/next-app-typescript",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-typescript/public/openapi.json",
    openApiPaths: [],
    port: 3101,
    title: "API Documentation",
  },
  {
    name: "next-app-scalar",
    appDir: "apps/next-app-scalar",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-scalar/public/openapi.json",
    openApiPaths: [],
    port: 3102,
    title: "API Documentation",
  },
  {
    name: "next-app-swagger",
    appDir: "apps/next-app-swagger",
    docsPath: "/api-docs",
    docsSelector: ".swagger-ui",
    docsText: ["API Documentation"],
    openApiFile: "apps/next-app-swagger/public/openapi.json",
    openApiPaths: [],
    port: 3103,
    title: "API Documentation",
  },
  {
    name: "next-app-sandbox",
    appDir: "apps/next-app-sandbox",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-sandbox/public/openapi.json",
    openApiPaths: [],
    port: 3104,
    title: "API Documentation",
  },
  {
    name: "next-app-drizzle-zod",
    appDir: "apps/next-app-drizzle-zod",
    docsPath: "/api-docs",
    docsText: ["Drizzle-Zod Blog API", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-drizzle-zod/public/openapi.json",
    openApiPaths: [],
    port: 3105,
    title: "Drizzle-Zod Blog API",
  },
  {
    name: "next-pages-router",
    appDir: "apps/next-pages-router",
    docsPath: "/api-docs",
    docsText: ["Next.js Pages Router API", "Download OpenAPI Document"],
    openApiFile: "apps/next-pages-router/public/openapi.json",
    openApiPaths: [],
    port: 3106,
    title: "Next.js Pages Router API",
  },
  {
    name: "next-app-mixed-schemas",
    appDir: "apps/next-app-mixed-schemas",
    docsPath: "/api-docs",
    docsText: ["Mixed Schema Types API", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-mixed-schemas/public/openapi.json",
    openApiPaths: [],
    port: 3107,
    title: "Mixed Schema Types API",
  },
] as const;

export function getE2EAppConfig(appName = process.env.E2E_APP): E2EAppConfig {
  const resolvedName = appName ?? DEFAULT_E2E_APP_NAME;
  const app = E2E_APPS.find(({ name }) => name === resolvedName);

  if (!app) {
    throw new Error(
      `Unknown E2E app "${resolvedName}". Expected one of: ${E2E_APPS.map(({ name }) => name).join(", ")}.`,
    );
  }

  return app;
}
