import { FrameworkKind, type OpenApiTemplate } from "../shared/types.js";

export const INIT_FRAMEWORKS = ["next", "tanstack", "react-router"] as const;

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
};

export function getInitFrameworkTemplateOverrides(
  framework: InitFramework = "next",
): FrameworkTemplateOverrides {
  return FRAMEWORK_TEMPLATE_OVERRIDES[framework];
}
