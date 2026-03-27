import path from "path";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { traverse } from "../../shared/babel-traverse.js";

type TypeDefinitions = Record<string, any>;

export function collectImports(
  ast: t.File,
  filePath: string,
  importMap: Record<string, Record<string, string>>,
): void {
  const normalizedPath = path.normalize(filePath);
  if (!importMap[normalizedPath]) {
    importMap[normalizedPath] = {};
  }
  const importEntries = importMap[normalizedPath]!;

  traverse(ast, {
    ImportDeclaration: (nodePath: NodePath<t.ImportDeclaration>) => {
      const importPath = nodePath.node.source.value;

      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier)) {
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          importEntries[importedName] = importPath;
        } else if (t.isImportDefaultSpecifier(specifier)) {
          importEntries[specifier.local.name] = importPath;
        } else if (t.isImportNamespaceSpecifier(specifier)) {
          importEntries[specifier.local.name] = importPath;
        }
      });
    },
  });
}

export function resolveImportPath(
  importPath: string,
  fromFilePath: string,
  fileAccess: Pick<typeof import("fs"), "existsSync">,
): string | null {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const fromDir = path.dirname(fromFilePath);
  const resolvedPath = path.resolve(fromDir, importPath);

  if (fileAccess.existsSync(resolvedPath + ".ts")) {
    return resolvedPath + ".ts";
  }

  if (fileAccess.existsSync(resolvedPath + ".tsx")) {
    return resolvedPath + ".tsx";
  }

  if (fileAccess.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  return null;
}

export function collectAllExportedDefinitions(
  ast: any,
  typeDefinitions: TypeDefinitions,
  currentFile: string,
): void {
  traverse(ast, {
    TSTypeAliasDeclaration: (path: any) => {
      if (path.node.id && t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        if (!typeDefinitions[name]) {
          const node =
            path.node.typeParameters && path.node.typeParameters.params.length > 0
              ? path.node
              : path.node.typeAnnotation;
          typeDefinitions[name] = { node, filePath: currentFile };
        }
      }
    },
    TSInterfaceDeclaration: (path: any) => {
      if (path.node.id && t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        if (!typeDefinitions[name]) {
          typeDefinitions[name] = { node: path.node, filePath: currentFile };
        }
      }
    },
    TSEnumDeclaration: (path: any) => {
      if (path.node.id && t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        if (!typeDefinitions[name]) {
          typeDefinitions[name] = { node: path.node, filePath: currentFile };
        }
      }
    },
    ExportNamedDeclaration: (path: any) => {
      if (t.isTSInterfaceDeclaration(path.node.declaration)) {
        const interfaceDecl = path.node.declaration;
        if (interfaceDecl.id && t.isIdentifier(interfaceDecl.id)) {
          const name = interfaceDecl.id.name;
          if (!typeDefinitions[name]) {
            typeDefinitions[name] = { node: interfaceDecl, filePath: currentFile };
          }
        }
      }

      if (t.isTSTypeAliasDeclaration(path.node.declaration)) {
        const typeDecl = path.node.declaration;
        if (typeDecl.id && t.isIdentifier(typeDecl.id)) {
          const name = typeDecl.id.name;
          if (!typeDefinitions[name]) {
            const node =
              typeDecl.typeParameters && typeDecl.typeParameters.params.length > 0
                ? typeDecl
                : typeDecl.typeAnnotation;
            typeDefinitions[name] = { node, filePath: currentFile };
          }
        }
      }
    },
  });
}

export function collectTypeDefinitions(
  ast: any,
  schemaName: string,
  typeDefinitions: TypeDefinitions,
  currentFile: string,
): void {
  traverse(ast, {
    VariableDeclarator: (path: any) => {
      if (t.isIdentifier(path.node.id, { name: schemaName })) {
        const name = path.node.id.name;
        typeDefinitions[name] = { node: path.node.init || path.node, filePath: currentFile };
      }
    },
    TSTypeAliasDeclaration: (path: any) => {
      if (t.isIdentifier(path.node.id, { name: schemaName })) {
        const name = path.node.id.name;
        const node =
          path.node.typeParameters && path.node.typeParameters.params.length > 0
            ? path.node
            : path.node.typeAnnotation;
        typeDefinitions[name] = { node, filePath: currentFile };
      }
    },
    TSInterfaceDeclaration: (path: any) => {
      if (t.isIdentifier(path.node.id, { name: schemaName })) {
        const name = path.node.id.name;
        typeDefinitions[name] = { node: path.node, filePath: currentFile };
      }
    },
    TSEnumDeclaration: (path: any) => {
      if (t.isIdentifier(path.node.id, { name: schemaName })) {
        const name = path.node.id.name;
        typeDefinitions[name] = { node: path.node, filePath: currentFile };
      }
    },
    FunctionDeclaration: (path: any) => {
      if (path.node.id && t.isIdentifier(path.node.id, { name: schemaName })) {
        const name = path.node.id.name;
        typeDefinitions[name] = { node: path.node, filePath: currentFile };
      }
    },
    ExportNamedDeclaration: (path: any) => {
      if (t.isVariableDeclaration(path.node.declaration)) {
        path.node.declaration.declarations.forEach((declaration: any) => {
          if (
            t.isIdentifier(declaration.id) &&
            declaration.id.name === schemaName &&
            declaration.init &&
            t.isCallExpression(declaration.init) &&
            t.isMemberExpression(declaration.init.callee) &&
            t.isIdentifier(declaration.init.callee.object) &&
            declaration.init.callee.object.name === "z"
          ) {
            const name = declaration.id.name;
            typeDefinitions[name] = { node: declaration.init, filePath: currentFile };
          }
        });
      }

      if (t.isFunctionDeclaration(path.node.declaration)) {
        const funcDecl = path.node.declaration;
        if (funcDecl.id && t.isIdentifier(funcDecl.id, { name: schemaName })) {
          const name = funcDecl.id.name;
          typeDefinitions[name] = { node: funcDecl, filePath: currentFile };
        }
      }
    },
  });
}
