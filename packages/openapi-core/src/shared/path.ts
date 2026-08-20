import path from "node:path";

export function isPathWithin(directoryPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(directoryPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
