import path from "path";
import * as t from "@babel/types";

import { logger } from "../../shared/logger.js";
import { parseTypeScriptFile } from "../../shared/utils.js";
import { collectImportMetadata } from "./prescan.js";
import type { OpenApiSchema } from "../../shared/types.js";

type ZodConverterFileAccess = Pick<typeof import("fs"), "existsSync" | "readFileSync">;

export function parseFileWithCache(
  filePath: string,
  fileAccess: ZodConverterFileAccess,
  fileASTCache: Map<string, t.File>,
  fileImportsCache: Map<string, Record<string, string>>,
  drizzleZodImports: Set<string>,
): t.File | null {
  if (fileASTCache.has(filePath)) {
    return fileASTCache.get(filePath)!;
  }

  try {
    const content = fileAccess.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);
    fileASTCache.set(filePath, ast);

    if (!fileImportsCache.has(filePath)) {
      const { importedModules, drizzleZodImports: importNames } = collectImportMetadata(ast);
      importNames.forEach((importName) => {
        drizzleZodImports.add(importName);
      });
      fileImportsCache.set(filePath, importedModules);
    }

    return ast;
  } catch (error) {
    logger.error(`[Factory] Error parsing file '${filePath}': ${error}`);
    return null;
  }
}

export function resolveImportPath(
  currentFilePath: string,
  importSource: string,
  fileAccess: Pick<typeof import("fs"), "existsSync">,
): string | null {
  if (importSource.startsWith(".")) {
    const currentDir = path.dirname(currentFilePath);
    const resolvedPath = path.resolve(currentDir, importSource);
    const extensions = [".ts", ".tsx", ".js", ".jsx"];

    if (!path.extname(resolvedPath)) {
      for (const ext of extensions) {
        const withExt = resolvedPath + ext;
        if (fileAccess.existsSync(withExt)) {
          return withExt;
        }
      }

      for (const ext of extensions) {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        if (fileAccess.existsSync(indexPath)) {
          return indexPath;
        }
      }
    } else if (fileAccess.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

export function extractReturnNode(functionNode: t.Node): t.Node | null {
  if (t.isArrowFunctionExpression(functionNode) && !t.isBlockStatement(functionNode.body)) {
    return functionNode.body;
  }

  const body =
    t.isFunctionDeclaration(functionNode) ||
    t.isArrowFunctionExpression(functionNode) ||
    t.isFunctionExpression(functionNode)
      ? functionNode.body
      : null;

  if (!body || !t.isBlockStatement(body)) {
    return null;
  }

  const findReturn = (statements: t.Statement[]): t.Node | null => {
    for (const stmt of statements) {
      if (t.isReturnStatement(stmt) && stmt.argument) {
        return stmt.argument;
      }

      if (t.isIfStatement(stmt)) {
        if (t.isBlockStatement(stmt.consequent)) {
          const found = findReturn(stmt.consequent.body);
          if (found) {
            return found;
          }
        } else if (t.isReturnStatement(stmt.consequent) && stmt.consequent.argument) {
          return stmt.consequent.argument;
        }

        if (stmt.alternate) {
          if (t.isBlockStatement(stmt.alternate)) {
            const found = findReturn(stmt.alternate.body);
            if (found) {
              return found;
            }
          } else if (t.isReturnStatement(stmt.alternate) && stmt.alternate.argument) {
            return stmt.alternate.argument;
          }
        }
      }
    }

    return null;
  };

  return findReturn(body.body);
}

export function substituteParameters(node: t.Node, paramMap: Map<string, t.Node>): t.Node {
  const cloned = t.cloneNode(node, true, false);

  const substitute = (currentNode: t.Node): t.Node => {
    if (t.isIdentifier(currentNode)) {
      if (paramMap.has(currentNode.name)) {
        return t.cloneNode(paramMap.get(currentNode.name)!, true, false);
      }
      return currentNode;
    }

    if (t.isCallExpression(currentNode)) {
      return t.callExpression(
        substitute(currentNode.callee) as t.Expression,
        currentNode.arguments.map((arg) => {
          if (t.isSpreadElement(arg)) {
            return t.spreadElement(substitute(arg.argument) as t.Expression);
          }
          return substitute(arg) as t.Expression;
        }),
      );
    }

    if (t.isMemberExpression(currentNode)) {
      return t.memberExpression(
        substitute(currentNode.object) as t.Expression,
        currentNode.computed
          ? (substitute(currentNode.property) as t.Expression)
          : currentNode.property,
        currentNode.computed,
      );
    }

    if (t.isObjectExpression(currentNode)) {
      return t.objectExpression(
        currentNode.properties.map((prop) => {
          if (t.isObjectProperty(prop)) {
            return t.objectProperty(
              prop.computed ? (substitute(prop.key) as t.Expression) : prop.key,
              substitute(prop.value) as t.Expression,
              prop.computed,
              prop.shorthand,
            );
          }
          if (t.isSpreadElement(prop)) {
            return t.spreadElement(substitute(prop.argument) as t.Expression);
          }
          return prop;
        }),
      );
    }

    if (t.isArrayExpression(currentNode)) {
      return t.arrayExpression(
        currentNode.elements.map((element) => {
          if (!element) {
            return null;
          }
          if (t.isSpreadElement(element)) {
            return t.spreadElement(substitute(element.argument) as t.Expression);
          }
          return substitute(element) as t.Expression;
        }),
      );
    }

    return currentNode;
  };

  return substitute(cloned);
}

export function expandFactoryCall(
  factoryNode: t.Node,
  callNode: t.CallExpression,
  processZodNode: (node: t.Node) => OpenApiSchema,
): OpenApiSchema | null {
  if (
    !t.isFunctionDeclaration(factoryNode) &&
    !t.isArrowFunctionExpression(factoryNode) &&
    !t.isFunctionExpression(factoryNode)
  ) {
    return null;
  }

  logger.debug(`[Factory] Expanding factory call with ${callNode.arguments.length} arguments`);

  const paramMap = new Map<string, t.Node>();
  const params = factoryNode.params;

  for (let i = 0; i < params.length && i < callNode.arguments.length; i++) {
    const param = params[i];
    const arg = callNode.arguments[i];

    if (t.isIdentifier(param) && arg) {
      paramMap.set(param.name, arg);
      logger.debug(`[Factory] Mapped parameter '${param.name}' to argument`);
    } else if (t.isObjectPattern(param)) {
      logger.debug(`[Factory] Skipping destructured parameter (not yet supported)`);
    }
  }

  const returnNode = extractReturnNode(factoryNode);
  if (!returnNode) {
    logger.debug("[Factory] No return statement found in factory");
    return null;
  }

  logger.debug(`[Factory] Return node type: ${returnNode.type}`);

  const substitutedNode = substituteParameters(returnNode, paramMap);
  logger.debug(`[Factory] Substituted node type: ${substitutedNode.type}`);

  const result = processZodNode(substitutedNode);
  if (result) {
    logger.debug(
      `[Factory] Successfully processed substituted node, result has ${Object.keys(result).length} keys`,
    );
  } else {
    logger.debug("[Factory] Failed to process substituted node");
  }

  return result;
}
