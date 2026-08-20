import { FrameworkKind, type OpenApiTemplate } from "@workspace/openapi-core/shared/types.js";

export const INIT_FRAMEWORKS = [
  "next",
  "tanstack",
  "react-router",
  "remix",
  "sveltekit",
  "nuxt",
  "astro",
  "hono",
  "express",
] as const;

export type InitFramework = (typeof INIT_FRAMEWORKS)[number];

type FrameworkTemplateOverrides = Pick<
  OpenApiTemplate,
  "apiDir" | "framework" | "includeOpenApiRoutes" | "next" | "routerType" | "schemaDir"
>;

const FRAMEWORK_TEMPLATE_OVERRIDES: Record<InitFramework, FrameworkTemplateOverrides> = {
  next: {
    apiDir: "./src/app/api",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.Nextjs,
      router: "app",
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: false,
  },
  tanstack: {
    apiDir: "./src/routes/api",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.Tanstack,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  "react-router": {
    apiDir: "./src/routes/api",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.ReactRouter,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  remix: {
    apiDir: "./app/routes",
    routerType: "app",
    schemaDir: "./app",
    framework: {
      kind: FrameworkKind.Remix,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  sveltekit: {
    apiDir: "./src/routes",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.SvelteKit,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  nuxt: {
    apiDir: "./server/api",
    routerType: "app",
    schemaDir: "./server",
    framework: {
      kind: FrameworkKind.Nuxt,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  astro: {
    apiDir: "./src/pages/api",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.Astro,
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  hono: {
    apiDir: "./src",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.Hono,
      modulePath: "./src/index.ts",
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
  express: {
    apiDir: "./src",
    routerType: "app",
    schemaDir: "./src",
    framework: {
      kind: FrameworkKind.Express,
      modulePath: "./src/index.ts",
    },
    next: {
      adapterPath: undefined,
    },
    includeOpenApiRoutes: true,
  },
};

export function getInitFrameworkTemplateOverrides(
  framework: InitFramework = "next",
): FrameworkTemplateOverrides {
  return FRAMEWORK_TEMPLATE_OVERRIDES[framework];
}
