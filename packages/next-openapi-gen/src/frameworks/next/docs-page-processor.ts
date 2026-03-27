import fs from "node:fs";
import path from "node:path";

import { getDocsPage } from "../../init/ui-registry.js";

export async function createNextDocsPage(
  docsUrl: string,
  ui: string,
  outputFile: string,
): Promise<string | null> {
  if (ui === "none") {
    return null;
  }

  const routeSegments = docsUrl.split("/").filter(Boolean);
  const srcPath = path.join(process.cwd(), "src");
  const paths = [fs.existsSync(srcPath) ? "src" : "", "app", ...routeSegments].filter(Boolean);

  const docsDir = path.join(process.cwd(), ...paths);
  await fs.promises.mkdir(docsDir, { recursive: true });

  const componentPath = path.join(docsDir, "page.tsx");
  await fs.promises.writeFile(componentPath, getDocsPage(ui, outputFile).trim());

  return `${paths.join("/")}/page.tsx`;
}
