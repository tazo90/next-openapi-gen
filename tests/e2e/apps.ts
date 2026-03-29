export type E2EAppName =
  | "next-app-zod"
  | "next-app-typescript"
  | "next-app-scalar"
  | "next-app-swagger"
  | "next-app-sandbox"
  | "next-app-drizzle-zod"
  | "next-pages-router"
  | "next-app-mixed-schemas"
  | "tanstack-app"
  | "react-router-app"
  | "next-app-adapter"
  | "next-app-next-config"
  | "next-app-ts-config";

export type E2EOpenApiReadyStage = "generate" | "build";

export type E2EAppConfig = {
  name: E2EAppName;
  appDir: string;
  buildCommand: string;
  docsPath: string;
  docsSelector?: string;
  docsText: string[];
  generateCommand?: string;
  openApiFile: string;
  openApiPaths: string[];
  openApiReadyStage?: E2EOpenApiReadyStage;
  port: number;
  startCommand: string;
  title: string;
};

const DEFAULT_E2E_APP_NAME: E2EAppName = "next-app-zod";

const E2E_APPS: readonly E2EAppConfig[] = [
  {
    name: "next-app-zod",
    appDir: "apps/next-app-zod",
    buildCommand: "pnpm --dir apps/next-app-zod exec next build",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-zod exec next-openapi-gen generate",
    openApiFile: "apps/next-app-zod/public/openapi.json",
    openApiPaths: [],
    port: 3100,
    startCommand: "pnpm --dir apps/next-app-zod exec next start --hostname localhost --port 3100",
    title: "API Documentation",
  },
  {
    name: "next-app-typescript",
    appDir: "apps/next-app-typescript",
    buildCommand: "pnpm --dir apps/next-app-typescript exec next build",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-typescript exec next-openapi-gen generate",
    openApiFile: "apps/next-app-typescript/public/openapi.json",
    openApiPaths: [],
    port: 3101,
    startCommand:
      "pnpm --dir apps/next-app-typescript exec next start --hostname localhost --port 3101",
    title: "API Documentation",
  },
  {
    name: "next-app-scalar",
    appDir: "apps/next-app-scalar",
    buildCommand: "pnpm --dir apps/next-app-scalar exec next build",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-scalar exec next-openapi-gen generate",
    openApiFile: "apps/next-app-scalar/public/openapi.json",
    openApiPaths: [],
    port: 3102,
    startCommand:
      "pnpm --dir apps/next-app-scalar exec next start --hostname localhost --port 3102",
    title: "API Documentation",
  },
  {
    name: "next-app-swagger",
    appDir: "apps/next-app-swagger",
    buildCommand: "pnpm --dir apps/next-app-swagger exec next build",
    docsPath: "/api-docs",
    docsSelector: ".swagger-ui",
    docsText: ["API Documentation"],
    generateCommand: "pnpm --dir apps/next-app-swagger exec next-openapi-gen generate",
    openApiFile: "apps/next-app-swagger/public/openapi.json",
    openApiPaths: [],
    port: 3103,
    startCommand:
      "pnpm --dir apps/next-app-swagger exec next start --hostname localhost --port 3103",
    title: "API Documentation",
  },
  {
    name: "next-app-sandbox",
    appDir: "apps/next-app-sandbox",
    buildCommand: "pnpm --dir apps/next-app-sandbox exec next build",
    docsPath: "/api-docs",
    docsText: ["API Documentation", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-sandbox exec next-openapi-gen generate",
    openApiFile: "apps/next-app-sandbox/public/openapi.json",
    openApiPaths: [],
    port: 3104,
    startCommand:
      "pnpm --dir apps/next-app-sandbox exec next start --hostname localhost --port 3104",
    title: "API Documentation",
  },
  {
    name: "next-app-drizzle-zod",
    appDir: "apps/next-app-drizzle-zod",
    buildCommand: "pnpm --dir apps/next-app-drizzle-zod exec next build",
    docsPath: "/api-docs",
    docsText: ["Drizzle-Zod Blog API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-drizzle-zod exec next-openapi-gen generate",
    openApiFile: "apps/next-app-drizzle-zod/public/openapi.json",
    openApiPaths: [],
    port: 3105,
    startCommand:
      "pnpm --dir apps/next-app-drizzle-zod exec next start --hostname localhost --port 3105",
    title: "Drizzle-Zod Blog API",
  },
  {
    name: "next-pages-router",
    appDir: "apps/next-pages-router",
    buildCommand: "pnpm --dir apps/next-pages-router exec next build",
    docsPath: "/api-docs",
    docsText: ["Next.js Pages Router API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-pages-router exec next-openapi-gen generate",
    openApiFile: "apps/next-pages-router/public/openapi.json",
    openApiPaths: [],
    port: 3106,
    startCommand:
      "pnpm --dir apps/next-pages-router exec next start --hostname localhost --port 3106",
    title: "Next.js Pages Router API",
  },
  {
    name: "next-app-mixed-schemas",
    appDir: "apps/next-app-mixed-schemas",
    buildCommand: "pnpm --dir apps/next-app-mixed-schemas exec next build",
    docsPath: "/api-docs",
    docsText: ["Mixed Schema Types API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-mixed-schemas exec next-openapi-gen generate",
    openApiFile: "apps/next-app-mixed-schemas/public/openapi.json",
    openApiPaths: [],
    port: 3107,
    startCommand:
      "pnpm --dir apps/next-app-mixed-schemas exec next start --hostname localhost --port 3107",
    title: "Mixed Schema Types API",
  },
  {
    name: "tanstack-app",
    appDir: "apps/tanstack-app",
    buildCommand: "pnpm --dir apps/tanstack-app exec vite build",
    docsPath: "/api-docs",
    docsText: ["TanStack Router API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/tanstack-app exec next-openapi-gen generate",
    openApiFile: "apps/tanstack-app/public/openapi.json",
    openApiPaths: ["/users/{id}"],
    port: 3108,
    startCommand:
      "pnpm --dir apps/tanstack-app exec vite preview --host localhost --port 3108 --strictPort",
    title: "TanStack Router API",
  },
  {
    name: "react-router-app",
    appDir: "apps/react-router-app",
    buildCommand: "pnpm --dir apps/react-router-app exec vite build",
    docsPath: "/api-docs",
    docsText: ["React Router API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/react-router-app exec next-openapi-gen generate",
    openApiFile: "apps/react-router-app/public/openapi.json",
    openApiPaths: ["/projects/{projectId}"],
    port: 3109,
    startCommand:
      "pnpm --dir apps/react-router-app exec vite preview --host localhost --port 3109 --strictPort",
    title: "React Router API",
  },
  {
    name: "next-app-adapter",
    appDir: "apps/next-app-adapter",
    buildCommand: "pnpm --dir apps/next-app-adapter exec next build",
    docsPath: "/api-docs",
    docsText: ["Next Adapter API", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-adapter/public/openapi.json",
    openApiPaths: ["/products/{id}"],
    openApiReadyStage: "build",
    port: 3110,
    startCommand:
      "pnpm --dir apps/next-app-adapter exec next start --hostname localhost --port 3110",
    title: "Next Adapter API",
  },
  {
    name: "next-app-next-config",
    appDir: "apps/next-app-next-config",
    buildCommand: "pnpm --dir apps/next-app-next-config exec next build",
    docsPath: "/api-docs",
    docsText: ["Next Config Integration API", "Download OpenAPI Document"],
    openApiFile: "apps/next-app-next-config/public/openapi.json",
    openApiPaths: ["/projects/{id}"],
    openApiReadyStage: "build",
    port: 3111,
    startCommand:
      "pnpm --dir apps/next-app-next-config exec next start --hostname localhost --port 3111",
    title: "Next Config Integration API",
  },
  {
    name: "next-app-ts-config",
    appDir: "apps/next-app-ts-config",
    buildCommand: "pnpm --dir apps/next-app-ts-config exec next build",
    docsPath: "/api-docs",
    docsText: ["Typed Config API", "Download OpenAPI Document"],
    generateCommand: "pnpm --dir apps/next-app-ts-config exec next-openapi-gen generate",
    openApiFile: "apps/next-app-ts-config/public/openapi.json",
    openApiPaths: ["/orders/{id}"],
    port: 3112,
    startCommand:
      "pnpm --dir apps/next-app-ts-config exec next start --hostname localhost --port 3112",
    title: "Typed Config API",
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
