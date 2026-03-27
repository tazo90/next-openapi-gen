import { rapidocDeps, rapidocDevDeps, RapidocUI } from "./ui/rapidoc.js";
import { RedocUI, redocDeps, redocDevDeps } from "./ui/redoc.js";
import { scalarDeps, scalarDevDeps, ScalarUI } from "./ui/scalar.js";
import { StoplightUI, stoplightDeps, stoplightDevDeps } from "./ui/stoplight.js";
import { swaggerDeps, swaggerDevDeps, SwaggerUI } from "./ui/swagger.js";
import type { UiType } from "./types.js";

export const UI_TYPES = ["scalar", "swagger", "redoc", "stoplight", "rapidoc"] as const;
export const UI_TYPES_WITH_NONE = [...UI_TYPES, "none"] as const;

export type RegisteredUiType = (typeof UI_TYPES)[number];
export type UiRegistryEntry = {
  deps: string[];
  devDeps: string[];
  render: (outputFile: string) => string;
  getInstallFlags: (packageManager: string) => string;
};

export const UI_REGISTRY: Record<RegisteredUiType, UiRegistryEntry> = {
  scalar: {
    deps: scalarDeps,
    devDeps: scalarDevDeps,
    render: ScalarUI,
    getInstallFlags: () => "",
  },
  swagger: {
    deps: swaggerDeps,
    devDeps: swaggerDevDeps,
    render: SwaggerUI,
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
    deps: redocDeps,
    devDeps: redocDevDeps,
    render: RedocUI,
    getInstallFlags: () => "",
  },
  stoplight: {
    deps: stoplightDeps,
    devDeps: stoplightDevDeps,
    render: StoplightUI,
    getInstallFlags: () => "",
  },
  rapidoc: {
    deps: rapidocDeps,
    devDeps: rapidocDevDeps,
    render: RapidocUI,
    getInstallFlags: () => "",
  },
};

function getUiRegistryEntry(ui: UiType | string): UiRegistryEntry {
  return UI_REGISTRY[(ui as RegisteredUiType) || "scalar"] || UI_REGISTRY.scalar;
}

export function getDocsPage(ui: UiType | string, outputFile: string): string {
  return getUiRegistryEntry(ui).render(outputFile);
}

export function getDocsPageDependencies(ui: UiType | string): string {
  return getUiRegistryEntry(ui).deps.join(" ");
}

export function getDocsPageDevDependencies(ui: UiType | string): string {
  return getUiRegistryEntry(ui).devDeps.join(" ");
}

export function getDocsPageInstallFlags(ui: UiType | string, packageManager: string): string {
  if (ui === "none") {
    return "";
  }

  return getUiRegistryEntry(ui).getInstallFlags(packageManager);
}
