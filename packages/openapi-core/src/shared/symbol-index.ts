import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { traverse } from "./babel-traverse.js";

/**
 * Declaration kinds indexed per-file. Values are the top-level AST nodes
 * (or their relevant child nodes for enum members / const initializers) that
 * downstream callers can inspect without re-traversing the AST.
 */
export type FileSymbolIndex = {
  tsEnums: Map<string, t.TSEnumDeclaration>;
  constObjects: Map<string, t.ObjectExpression>;
  constArrays: Map<string, t.ArrayExpression>;
  constLiterals: Map<string, t.Literal>;
  typeAliases: Map<string, t.TSTypeAliasDeclaration>;
  /**
   * Multiple interface declarations with the same name are merged in TypeScript.
   * We keep every declaration so the consumer can do the merge.
   */
  interfaces: Map<string, t.TSInterfaceDeclaration[]>;
  /** Star re-exports — `export * from "..."` — as the module source strings. */
  exportsStar: string[];
  /**
   * Map of local name -> declaration node for every top-level `export { ... }` / `export const`,
   * `export function`, `export type` etc. If the local name re-exports an import, the value is
   * an `ExportSpecifier` and the original import source is captured in `namedReExports`.
   */
  namedExports: Map<string, t.Node>;
  /** Local name -> { source, importedName } for `export { Foo } from "..."` etc. */
  namedReExports: Map<string, { source: string; importedName: string }>;
  /** Function-like declarations keyed by local name. */
  functions: Map<string, t.Node>;
  /** Variable declarators (of any kind) keyed by local name, including non-const. */
  variables: Map<string, t.VariableDeclarator>;
};

/**
 * Build a single-pass symbol index from a file AST. Intended to be called once
 * per parsed file and cached by `SymbolResolver`.
 */
export function buildFileSymbolIndex(ast: t.File): FileSymbolIndex {
  const index: FileSymbolIndex = {
    tsEnums: new Map(),
    constObjects: new Map(),
    constArrays: new Map(),
    constLiterals: new Map(),
    typeAliases: new Map(),
    interfaces: new Map(),
    exportsStar: [],
    namedExports: new Map(),
    namedReExports: new Map(),
    functions: new Map(),
    variables: new Map(),
  };

  // Use direct program body iteration first — most declarations we care about are top-level.
  for (const statement of ast.program.body) {
    indexTopLevelStatement(statement, index);
  }

  // Also traverse once to catch anything nested under `declare module`, namespace blocks, etc.
  traverse(ast, {
    ExportAllDeclaration(nodePath: NodePath<t.ExportAllDeclaration>) {
      const src = nodePath.node.source.value;
      if (!index.exportsStar.includes(src)) {
        index.exportsStar.push(src);
      }
    },
  });

  return index;
}

function indexTopLevelStatement(statement: t.Statement, index: FileSymbolIndex): void {
  // `export { foo, bar as baz }` / `export { x } from "..."`
  if (t.isExportNamedDeclaration(statement)) {
    const source = statement.source?.value;
    statement.specifiers.forEach((specifier) => {
      if (t.isExportSpecifier(specifier)) {
        const exportedName = t.isIdentifier(specifier.exported)
          ? specifier.exported.name
          : specifier.exported.value;
        const localName = specifier.local.name;
        if (source) {
          index.namedReExports.set(exportedName, { source, importedName: localName });
        } else {
          index.namedExports.set(exportedName, specifier);
        }
      }
    });

    if (statement.declaration) {
      indexDeclaration(statement.declaration, index, true);
    }
    return;
  }

  if (t.isExportDefaultDeclaration(statement)) {
    return;
  }

  if (t.isExportAllDeclaration(statement)) {
    const src = statement.source.value;
    if (!index.exportsStar.includes(src)) {
      index.exportsStar.push(src);
    }
    return;
  }

  indexDeclaration(statement, index, false);
}

function indexDeclaration(
  declaration: t.Statement | t.Declaration,
  index: FileSymbolIndex,
  isExported: boolean,
): void {
  if (t.isTSEnumDeclaration(declaration) && t.isIdentifier(declaration.id)) {
    index.tsEnums.set(declaration.id.name, declaration);
    if (isExported) index.namedExports.set(declaration.id.name, declaration);
    return;
  }

  if (t.isTSTypeAliasDeclaration(declaration) && t.isIdentifier(declaration.id)) {
    index.typeAliases.set(declaration.id.name, declaration);
    if (isExported) index.namedExports.set(declaration.id.name, declaration);
    return;
  }

  if (t.isTSInterfaceDeclaration(declaration) && t.isIdentifier(declaration.id)) {
    const name = declaration.id.name;
    const existing = index.interfaces.get(name);
    if (existing) {
      existing.push(declaration);
    } else {
      index.interfaces.set(name, [declaration]);
    }
    if (isExported) index.namedExports.set(name, declaration);
    return;
  }

  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    index.functions.set(declaration.id.name, declaration);
    if (isExported) index.namedExports.set(declaration.id.name, declaration);
    return;
  }

  if (t.isVariableDeclaration(declaration)) {
    const isConst = declaration.kind === "const";
    for (const declarator of declaration.declarations) {
      if (!t.isIdentifier(declarator.id) || !declarator.init) {
        continue;
      }

      const name = declarator.id.name;
      index.variables.set(name, declarator);
      if (isExported) index.namedExports.set(name, declarator);

      if (!isConst) {
        continue;
      }

      // Unwrap `as const` / `satisfies` wrappers so later lookups don't have to.
      let init: t.Node = declarator.init;
      while (t.isTSAsExpression(init) || t.isTSSatisfiesExpression(init)) {
        init = init.expression;
      }

      if (t.isObjectExpression(init)) {
        index.constObjects.set(name, init);
      } else if (t.isArrayExpression(init)) {
        index.constArrays.set(name, init);
      } else if (
        t.isStringLiteral(init) ||
        t.isNumericLiteral(init) ||
        t.isBooleanLiteral(init) ||
        t.isNullLiteral(init)
      ) {
        index.constLiterals.set(name, init as t.Literal);
      } else if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        index.functions.set(name, init);
      }
    }
    return;
  }
}
