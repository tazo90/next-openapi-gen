import fs from "node:fs";
import path from "node:path";

import { dump } from "js-yaml";

export type DocumentFormat = "json" | "yaml";

export function getDocumentFormat(filePath: string): DocumentFormat {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".yaml" || extension === ".yml" ? "yaml" : "json";
}

export function serializeDocument(document: unknown, format: DocumentFormat): string {
  if (format === "yaml") {
    return dump(document, {
      lineWidth: 120,
      noRefs: true,
    });
  }

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeDocumentArtifact(filePath: string, document: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeDocument(document, getDocumentFormat(filePath)));
}
