import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRapidocTemplate } from "./rapidoc-template.js";
import type { InitFramework } from "./framework.js";

const packageRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
