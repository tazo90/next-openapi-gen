import path from "node:path";
import { pathToFileURL } from "node:url";

export function toFileUrl(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function resolveDocumentSelf(explicitSelf: string | undefined, outputFile: string): string {
  if (explicitSelf) {
    return explicitSelf;
  }

  return toFileUrl(outputFile);
}

export function relativizeDocumentUri(fromFile: string, toFile: string): string {
  const relativePath = path.relative(path.dirname(fromFile), toFile);
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}
