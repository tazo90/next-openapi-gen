import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const uiTemplatesDir = path.join(packageRootDir, "templates", "init", "ui");

type RenderUiTemplateOptions = {
  outputFile: string;
};

export function resolveUiTemplatePath(templateFile: string) {
  return path.join(uiTemplatesDir, templateFile);
}

export function renderUiTemplate(templateFile: string, options: RenderUiTemplateOptions) {
  let template = fs.readFileSync(resolveUiTemplatePath(templateFile), "utf8");

  if (templateFile === "rapidoc.tsx") {
    template = template.replace('const RapiDoc = "rapi-doc" as any;\n\n', "");
    template = template.replaceAll("<RapiDoc", "<rapi-doc");
    template = template.replaceAll("</RapiDoc>", "</rapi-doc>");
  }

  return template.replaceAll("__NEXT_OPENAPI_GEN_OUTPUT_FILE__", options.outputFile);
}
