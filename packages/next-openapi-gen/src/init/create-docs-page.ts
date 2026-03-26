import fs from "node:fs";
import path from "node:path";

import { getDocsPage } from "./ui-manifest.js";

export async function createDocsPage(ui: string, outputFile: string): Promise<string | null> {
  if (ui === "none") {
    return null;
  }

  const paths = ["app", "api-docs"];
  const srcPath = path.join(process.cwd(), "src");

  if (fs.existsSync(srcPath)) {
    paths.unshift("src");
  }

  const docsDir = path.join(process.cwd(), ...paths);
  await fs.promises.mkdir(docsDir, { recursive: true });

  const componentPath = path.join(docsDir, "page.tsx");
  await fs.promises.writeFile(componentPath, getDocsPage(ui, outputFile).trim());

  return `${paths.join("/")}/page.tsx`;
}
