import { DEFAULT_UI } from "../config/defaults.js";
import type { PackageManager } from "./package-manager.js";
import { renderUiTemplate, resolveUiTemplatePath } from "./ui-template.js";
import type { UiType } from "./types.js";

export const UI_TYPES = ["scalar", "swagger", "redoc", "stoplight", "rapidoc"] as const;
export const UI_TYPES_WITH_NONE = [...UI_TYPES, "none"] as const;
const SCALAR_DEPS = ["@scalar/api-reference-react", "ajv"];
const SWAGGER_DEPS = ["swagger-ui", "swagger-ui-react"];
const SWAGGER_DEV_DEPS = ["@types/swagger-ui-react"];
const REDOC_DEPS = ["redoc"];
const STOPLIGHT_DEPS = ["@stoplight/elements"];
const RAPIDOC_DEPS = ["rapidoc"];

type RegisteredUiType = (typeof UI_TYPES)[number];
type UiRegistryEntry = {
  deps: string[];
  devDeps: string[];
  templateFile: string;
  getInstallFlags: (packageManager: PackageManager) => string;
};

export const UI_REGISTRY: Record<RegisteredUiType, UiRegistryEntry> = {
  scalar: {
    deps: SCALAR_DEPS,
    devDeps: [],
    templateFile: "scalar.tsx",
    getInstallFlags: () => "",
  },
  swagger: {
    deps: SWAGGER_DEPS,
    devDeps: SWAGGER_DEV_DEPS,
    templateFile: "swagger.tsx",
    getInstallFlags: (packageManager) => {
      if (packageManager === "pnpm") {
        return "--no-strict-peer-dependencies";
      }

      if (packageManager === "yarn") {
        return "";
      }

      return "--legacy-peer-deps";
    },
  },
  redoc: {
    deps: REDOC_DEPS,
    devDeps: [],
    templateFile: "redoc.tsx",
    getInstallFlags: () => "",
  },
  stoplight: {
    deps: STOPLIGHT_DEPS,
    devDeps: [],
    templateFile: "stoplight.tsx",
    getInstallFlags: () => "",
  },
  rapidoc: {
    deps: RAPIDOC_DEPS,
    devDeps: [],
    templateFile: "rapidoc.tsx",
    getInstallFlags: () => "",
  },
};

function getUiRegistryEntry(ui: UiType | string): UiRegistryEntry {
  return UI_REGISTRY[(ui as RegisteredUiType) || DEFAULT_UI] || UI_REGISTRY[DEFAULT_UI];
}

export function getDocsPage(ui: UiType | string, outputFile: string): string {
  return renderUiTemplate(getUiRegistryEntry(ui).templateFile, { outputFile });
}

export function getDocsPageTemplatePath(ui: UiType | string): string {
  return resolveUiTemplatePath(getUiRegistryEntry(ui).templateFile);
}

export function getDocsPageDependencies(ui: UiType | string): string {
  return getUiRegistryEntry(ui).deps.join(" ");
}

export function getDocsPageDevDependencies(ui: UiType | string): string {
  return getUiRegistryEntry(ui).devDeps.join(" ");
}

export function getDocsPageInstallFlags(
  ui: UiType | string,
  packageManager: PackageManager,
): string {
  if (ui === "none") {
    return "";
  }

  return getUiRegistryEntry(ui).getInstallFlags(packageManager);
}
