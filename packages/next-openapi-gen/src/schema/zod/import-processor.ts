import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "../../shared/babel-traverse.js";

export type ZodImportProcessingResult = {
  importedModules: Record<string, string>;
  drizzleZodImports: string[];
};

export function processImports(ast: t.File): ZodImportProcessingResult {
  const importedModules: Record<string, string> = {};
  const drizzleZodImports = new Set<string>();

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
  };
}
