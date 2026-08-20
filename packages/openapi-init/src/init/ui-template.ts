import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InitFramework } from "./framework.js";
import { normalizeRapidocTemplate } from "./rapidoc-template.js";

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

export function resolveUiTemplatePath(framework: InitFramework, templateFile: string): string {
  return path.join(
    uiTemplatesDir,
    getUiFrameworkDirectory(framework),
    getUiTemplateFileName(framework, templateFile),
  );
}

export function renderUiTemplate(
  framework: InitFramework,
  templateFile: string,
  options: RenderUiTemplateOptions,
): string {
  let template = fs.readFileSync(resolveUiTemplatePath(framework, templateFile), "utf8");

  if (templateFile === "rapidoc.tsx") {
    template = normalizeRapidocTemplate(template);
  }

  return template
    .replaceAll("__NEXT_OPENAPI_GEN_OUTPUT_FILE__", options.outputFile)
    .replaceAll("__NEXT_OPENAPI_GEN_ROUTE_PATH__", options.routePath);
}

export function getUiTemplateFileName(framework: InitFramework, templateFile: string): string {
  const base = templateFile.replace(/\.tsx$/, "");
  switch (framework) {
    case "sveltekit":
      return `${base}.svelte`;
    case "nuxt":
      return `${base}.vue`;
    case "astro":
      return `${base}.astro`;
    case "hono":
    case "express":
      return `${base}.ts`;
    case "next":
    case "tanstack":
    case "react-router":
    case "remix":
      return templateFile;
    default: {
      const exhaustive: never = framework;
      throw new Error(`Unknown init framework "${String(exhaustive)}"`);
    }
  }
}

function getUiFrameworkDirectory(framework: InitFramework) {
  switch (framework) {
    case "next":
      return "nextjs";
    case "tanstack":
      return "tanstack";
    case "react-router":
      return "reactrouter";
    case "remix":
      return "remix";
    case "sveltekit":
      return "sveltekit";
    case "nuxt":
      return "nuxt";
    case "astro":
      return "astro";
    case "hono":
      return "hono";
    case "express":
      return "express";
    default: {
      const exhaustive: never = framework;
      throw new Error(`Unknown init framework "${String(exhaustive)}"`);
    }
  }
}
