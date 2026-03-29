import { createDocsPage } from "../../init/create-docs-page.js";

export async function createNextDocsPage(
  docsUrl: string,
  ui: string,
  outputFile: string,
): Promise<string | null> {
  return createDocsPage({
    framework: "next",
    docsUrl,
    ui,
    outputFile,
  });
}
