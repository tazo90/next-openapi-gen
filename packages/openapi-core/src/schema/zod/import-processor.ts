import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "../../shared/babel-traverse.js";

type ZodImportProcessingResult = {
  importedModules: Record<string, string>;
  drizzleZodImports: string[];
  /**
   * Local name used for the `z` binding from the `zod` package, if any.
   * Supports `import { z } from "zod"`, `import { z as zod } from "zod"`,
   * `import * as z from "zod"`, and `import z from "zod"`.
   * Defaults to `"z"` for files that don't import `z` (e.g. barrel re-exports).
   */
  zodLocalName: string;
};

export function processImports(ast: t.File): ZodImportProcessingResult {
  const importedModules: Record<string, string> = {};
  const drizzleZodImports = new Set<string>();
  let zodLocalName = "z";

  traverse(ast, {
    ImportDeclaration: (path: NodePath<t.ImportDeclaration>) => {
      const source = path.node.source.value;

      if (source === "drizzle-zod") {
        path.node.specifiers.forEach((specifier: t.ImportDeclaration["specifiers"][number]) => {
          if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
            drizzleZodImports.add(specifier.local.name);
          }
        });
      }

      if (source === "zod") {
        path.node.specifiers.forEach((specifier: t.ImportDeclaration["specifiers"][number]) => {
          if (t.isImportSpecifier(specifier)) {
            // `{ z }` or `{ z as zod }` — imported === "z"
            const imported = specifier.imported;
            const importedName = t.isIdentifier(imported)
              ? imported.name
              : t.isStringLiteral(imported)
                ? imported.value
                : "";
            if (importedName === "z") {
              zodLocalName = specifier.local.name;
            }
          } else if (
            t.isImportDefaultSpecifier(specifier) ||
            t.isImportNamespaceSpecifier(specifier)
          ) {
            // `import z from "zod"` or `import * as zod from "zod"`.
            zodLocalName = specifier.local.name;
          }
        });
      }

      path.node.specifiers.forEach((specifier: t.ImportDeclaration["specifiers"][number]) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          importedModules[specifier.local.name] = source;
        }
      });
    },
  });

  return {
    importedModules,
    drizzleZodImports: [...drizzleZodImports],
    zodLocalName,
  };
}
