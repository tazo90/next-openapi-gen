import type { Stats } from "fs";

import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import path from "path";

const traverse = (traverseModule as any).default || traverseModule;

type FileAccess = {
  existsSync: (filePath: string) => boolean;
  readdirSync: (dir: string) => string[];
  statSync: (filePath: string) => Stats;
};

type ParseFileWithCache = (filePath: string) => t.File | null;
type ResolveImportPath = (currentFilePath: string, importSource: string) => string | null;
type IsZodSchema = (node: t.Node) => boolean;

export function extractTypeMappingsFromAST(ast: t.File): Record<string, string> {
  const mappings: Record<string, string> = {};

  traverse(ast, {
    TSTypeAliasDeclaration: (path: NodePath<t.TSTypeAliasDeclaration>) => {
      if (!t.isIdentifier(path.node.id) || !t.isTSTypeReference(path.node.typeAnnotation)) {
        return;
      }

      const typeName = path.node.id.name;
      const typeRef = path.node.typeAnnotation;

      let isInferType = false;
      if (
        t.isTSQualifiedName(typeRef.typeName) &&
        t.isIdentifier(typeRef.typeName.left) &&
        typeRef.typeName.left.name === "z" &&
        t.isIdentifier(typeRef.typeName.right) &&
        typeRef.typeName.right.name === "infer"
      ) {
        isInferType = true;
      } else if (t.isIdentifier(typeRef.typeName) && typeRef.typeName.name === "infer") {
        isInferType = true;
      }

      if (!isInferType || !typeRef.typeParameters || typeRef.typeParameters.params.length === 0) {
        return;
      }

      const param = typeRef.typeParameters.params[0];
      if (t.isTSTypeQuery(param) && t.isIdentifier(param.exprName)) {
        mappings[typeName] = param.exprName.name;
      }
    },
  });

  return mappings;
}

export function walkTypeScriptFiles(
  dir: string,
  fileAccess: FileAccess,
  visitFile: (filePath: string) => void,
): void {
  const files = fileAccess.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fileAccess.statSync(filePath);

    if (stats.isDirectory()) {
      walkTypeScriptFiles(filePath, fileAccess, visitFile);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      visitFile(filePath);
    }
  }
}

export function collectImportMetadata(ast: t.File): {
  importedModules: Record<string, string>;
  drizzleZodImports: Set<string>;
} {
  const importedModules: Record<string, string> = {};
  const drizzleZodImports = new Set<string>();

  traverse(ast, {
    ImportDeclaration: (path: NodePath<t.ImportDeclaration>) => {
      const source = path.node.source.value;

      if (source === "drizzle-zod") {
        path.node.specifiers.forEach((specifier) => {
          if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
            drizzleZodImports.add(specifier.local.name);
          }
        });
      }

      path.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          importedModules[specifier.local.name] = source;
        }
      });
    },
  });

  return { importedModules, drizzleZodImports };
}

export function isZodSchemaNode(node: t.Node, drizzleZodImports: Set<string>): boolean {
  if (t.isCallExpression(node)) {
    if (t.isIdentifier(node.callee) && drizzleZodImports.has(node.callee.name)) {
      return true;
    }

    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object) &&
      node.callee.object.name === "z"
    ) {
      return true;
    }

    if (t.isMemberExpression(node.callee) && t.isCallExpression(node.callee.object)) {
      return isZodSchemaNode(node.callee.object, drizzleZodImports);
    }
  }

  return false;
}

export function findFunctionInAST(ast: t.File, functionName: string): t.Node | null {
  let foundFunction: t.Node | null = null;

  traverse(ast, {
    FunctionDeclaration: (path: NodePath<t.FunctionDeclaration>) => {
      if (t.isIdentifier(path.node.id) && path.node.id.name === functionName) {
        foundFunction = path.node;
        path.stop();
      }
    },
    VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
      if (
        t.isIdentifier(path.node.id) &&
        path.node.id.name === functionName &&
        (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))
      ) {
        foundFunction = path.node.init;
        path.stop();
      }
    },
  });

  return foundFunction;
}

export function returnsZodSchemaNode(functionNode: t.Node, isZodSchema: IsZodSchema): boolean {
  if (
    !t.isFunctionDeclaration(functionNode) &&
    !t.isArrowFunctionExpression(functionNode) &&
    !t.isFunctionExpression(functionNode)
  ) {
    return false;
  }

  if (t.isArrowFunctionExpression(functionNode) && !t.isBlockStatement(functionNode.body)) {
    return isZodSchema(functionNode.body);
  }

  const body = functionNode.body;
  if (!t.isBlockStatement(body)) {
    return false;
  }

  const checkStatements = (statements: t.Statement[]): boolean => {
    for (const stmt of statements) {
      if (t.isReturnStatement(stmt) && stmt.argument && isZodSchema(stmt.argument)) {
        return true;
      }

      if (t.isIfStatement(stmt)) {
        if (t.isBlockStatement(stmt.consequent) && checkStatements(stmt.consequent.body)) {
          return true;
        }
        if (t.isReturnStatement(stmt.consequent) && stmt.consequent.argument) {
          if (isZodSchema(stmt.consequent.argument)) return true;
        }
        if (stmt.alternate) {
          if (t.isBlockStatement(stmt.alternate) && checkStatements(stmt.alternate.body)) {
            return true;
          }
          if (t.isReturnStatement(stmt.alternate) && stmt.alternate.argument) {
            if (isZodSchema(stmt.alternate.argument)) return true;
          }
        }
      }
    }

    return false;
  };

  return checkStatements(body.body);
}

export function findFactoryFunctionNode(options: {
  functionName: string;
  currentFilePath: string;
  currentAST: t.File;
  importedModules: Record<string, string>;
  factoryCache: Map<string, t.Node>;
  factoryCheckCache: Map<string, boolean>;
  fileAccess: Pick<FileAccess, "existsSync">;
  resolveImportPath: ResolveImportPath;
  parseFileWithCache: ParseFileWithCache;
  isZodSchema: IsZodSchema;
}): t.Node | null {
  const {
    functionName,
    currentFilePath,
    currentAST,
    importedModules,
    factoryCache,
    factoryCheckCache,
    fileAccess,
    resolveImportPath,
    parseFileWithCache,
    isZodSchema,
  } = options;

  if (factoryCache.has(functionName)) {
    return factoryCache.get(functionName)!;
  }

  if (factoryCheckCache.has(functionName)) {
    return null;
  }

  const localFactory = findFunctionInAST(currentAST, functionName);
  if (localFactory && returnsZodSchemaNode(localFactory, isZodSchema)) {
    factoryCache.set(functionName, localFactory);
    return localFactory;
  }

  const importSource = importedModules[functionName];
  if (importSource) {
    const importedFilePath = resolveImportPath(currentFilePath, importSource);
    if (importedFilePath && fileAccess.existsSync(importedFilePath)) {
      const importedAST = parseFileWithCache(importedFilePath);
      if (importedAST) {
        const importedFactory = findFunctionInAST(importedAST, functionName);
        if (importedFactory && returnsZodSchemaNode(importedFactory, isZodSchema)) {
          factoryCache.set(functionName, importedFactory);
          return importedFactory;
        }
      }
    }
  }

  factoryCheckCache.set(functionName, false);
  return null;
}
