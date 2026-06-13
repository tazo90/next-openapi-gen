import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRapidocTemplate } from "./rapidoc-template.js";
import type { InitFramework } from "./framework.js";

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (fs.existsSync(path.join(dir, "templates", "init", "ui"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Cannot locate templates directory");
    }
    dir = parent;
  }
}

const packageRootDir = findPackageRoot();
const uiTemplatesDir = path.join(packageRootDir, "templates", "init", "ui");

type RenderUiTemplateOptions = {
  outputFile: string;
  routePath: string;
};

export function resolveUiTemplatePath(framework: InitFramework, templateFile: string) {
  return path.join(uiTemplatesDir, getUiFrameworkDirectory(framework), templateFile);
}

export function renderUiTemplate(
  framework: InitFramework,
  templateFile: string,
  options: RenderUiTemplateOptions,
) {
  let template = fs.readFileSync(resolveUiTemplatePath(framework, templateFile), "utf8");

  if (templateFile === "rapidoc.tsx") {
    template = normalizeRapidocTemplate(template);
  }

  return template
    .replaceAll("__NEXT_OPENAPI_GEN_OUTPUT_FILE__", options.outputFile)
    .replaceAll("__NEXT_OPENAPI_GEN_ROUTE_PATH__", options.routePath);
}

function getUiFrameworkDirectory(framework: InitFramework) {
  switch (framework) {
    case "next":
      return "nextjs";
    case "tanstack":
      return "tanstack";
    case "react-router":
      return "reactrouter";
  }
}
