export const ZOD_IMPORT_PATHS = ["zod", "zod/v3", "zod/v4"] as const;

export function isZodImportPath(importPath: string): boolean {
  return ZOD_IMPORT_PATHS.includes(importPath as (typeof ZOD_IMPORT_PATHS)[number]);
}
