import { createNextDocsPage } from "../frameworks/next/docs-page-processor.js";

export async function createDocsPage(
  docsUrl: string,
  ui: string,
  outputFile: string,
): Promise<string | null> {
  return createNextDocsPage(docsUrl, ui, outputFile);
}
