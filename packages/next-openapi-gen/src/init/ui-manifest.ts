import { rapidocDeps, rapidocDevDeps, RapidocUI } from "./ui/rapidoc.js";
import { RedocUI, redocDeps, redocDevDeps } from "./ui/redoc.js";
import { scalarDeps, scalarDevDeps, ScalarUI } from "./ui/scalar.js";
import { StoplightUI, stoplightDeps, stoplightDevDeps } from "./ui/stoplight.js";
import { swaggerDeps, swaggerDevDeps, SwaggerUI } from "./ui/swagger.js";

import type { UiType } from "./types.js";

type UiManifest = {
  deps: string[];
  devDeps: string[];
  render: (outputFile: string) => string;
};

const uiManifests: Record<Exclude<UiType, "none">, UiManifest> = {
  scalar: {
    deps: scalarDeps,
    devDeps: scalarDevDeps,
    render: ScalarUI,
  },
  swagger: {
    deps: swaggerDeps,
    devDeps: swaggerDevDeps,
    render: SwaggerUI,
  },
  redoc: {
    deps: redocDeps,
    devDeps: redocDevDeps,
    render: RedocUI,
  },
  stoplight: {
    deps: stoplightDeps,
    devDeps: stoplightDevDeps,
    render: StoplightUI,
  },
  rapidoc: {
    deps: rapidocDeps,
    devDeps: rapidocDevDeps,
    render: RapidocUI,
  },
};

function getUiManifest(ui: UiType | string): UiManifest {
  return uiManifests[(ui as Exclude<UiType, "none">) || "scalar"] || uiManifests.scalar;
}

export function getDocsPage(ui: UiType | string, outputFile: string): string {
  return getUiManifest(ui).render(outputFile);
}

export function getDocsPageDependencies(ui: UiType | string): string {
  return getUiManifest(ui).deps.join(" ");
}

export function getDocsPageDevDependencies(ui: UiType | string): string {
  return getUiManifest(ui).devDeps.join(" ");
}

export function getDocsPageInstallFlags(ui: UiType | string, packageManager: string): string {
  if (ui !== "swagger") {
    return "";
  }

  if (packageManager === "pnpm") {
    return "--no-strict-peer-dependencies";
  }

  if (packageManager === "yarn") {
    return "";
  }

  return "--legacy-peer-deps";
}
