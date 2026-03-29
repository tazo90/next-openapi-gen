import fs from "node:fs";
import path from "node:path";

import { renderFrameworkDocsPage } from "./ui-registry.js";
import type { InitFramework } from "./framework.js";

type CreateDocsPageOptions = {
  framework?: InitFramework;
  docsUrl: string;
  ui: string;
  outputFile: string;
};

export async function createDocsPage(options: CreateDocsPageOptions): Promise<string | null> {
  const framework = options.framework ?? "next";

  if (options.ui === "none") {
    return null;
  }

  const relativePath = getDocsPageRelativePath(framework, options.docsUrl);
  const docsPage = renderFrameworkDocsPage(framework, options.ui, {
    outputFile: options.outputFile,
    routePath: getDocsRoutePath(options.docsUrl),
  });
  const absolutePath = path.join(process.cwd(), relativePath);

  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, `${docsPage.trim()}\n`);

  return relativePath;
}

export function getDocsPageRelativePath(framework: InitFramework, docsUrl: string): string {
  const routeSegments = docsUrl.split("/").filter(Boolean);

  switch (framework) {
    case "next": {
      const srcPath = path.join(process.cwd(), "src");
      const pathSegments = [
        fs.existsSync(srcPath) ? "src" : "",
        "app",
        ...routeSegments,
        "page.tsx",
      ];
      return path.join(...pathSegments.filter(Boolean));
    }
    case "tanstack":
      return path.join(
        "src",
        "routes",
        `${routeSegments.length > 0 ? routeSegments.join(".") : "index"}.tsx`,
      );
    case "react-router":
      return path.join(
        "src",
        "routes",
        `${routeSegments.length > 0 ? routeSegments.join(".") : "_index"}.tsx`,
      );
  }
}

function getDocsRoutePath(docsUrl: string): string {
  const routeSegments = docsUrl.split("/").filter(Boolean);

  if (routeSegments.length === 0) {
    return "/";
  }

  return `/${routeSegments.join("/")}`;
}
