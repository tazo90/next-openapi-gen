import path from "path";
import * as ts from "typescript";

import type { Diagnostic } from "./types.js";

type TypeScriptProject = {
  program: ts.Program;
  checker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
};

const projectCache = new Map<string, TypeScriptProject>();

export function getTypeScriptProject(filePath: string): TypeScriptProject {
  const absoluteFilePath = path.resolve(filePath);
  const configPath = ts.findConfigFile(
    path.dirname(absoluteFilePath),
    ts.sys.fileExists,
    "tsconfig.json",
  );
  const cacheKey = configPath || absoluteFilePath;
  const cachedProject = projectCache.get(cacheKey);
  if (cachedProject) {
    return cachedProject;
  }

  const project = configPath
    ? createConfiguredProject(configPath)
    : createSingleFileProject(absoluteFilePath);
  projectCache.set(cacheKey, project);
  return project;
}

export function resolveTypeScriptModule(importPath: string, fromFilePath: string): string | null {
  const project = getTypeScriptProject(fromFilePath);
  const resolutionHost = ts.createCompilerHost(project.compilerOptions, true);
  const resolvedModule = ts.resolveModuleName(
    importPath,
    path.resolve(fromFilePath),
    project.compilerOptions,
    resolutionHost,
  ).resolvedModule;

  if (!resolvedModule?.resolvedFileName) {
    return null;
  }

  const normalizedPath = resolvedModule.resolvedFileName;
  if (normalizedPath.endsWith(".d.ts")) {
    return null;
  }

  return normalizedPath;
}

export function resolveTypeScriptValueReference(
  referenceName: string,
  fromFilePath: string,
): { value?: unknown; diagnostic?: Diagnostic } {
  const absoluteFilePath = path.resolve(fromFilePath);
  const project = getTypeScriptProject(absoluteFilePath);
  const sourceFile = project.program.getSourceFile(absoluteFilePath);
  if (!sourceFile) {
    return {
      diagnostic: {
        code: "example-reference-unresolved",
        severity: "warning",
        message: `Could not resolve example reference "${referenceName}" because the source file was not part of the TypeScript project.`,
        filePath: absoluteFilePath,
      },
    };
  }

  const symbol = findValueSymbol(referenceName, sourceFile, project.checker);
  if (!symbol) {
    return {
      diagnostic: {
        code: "example-reference-unresolved",
        severity: "warning",
        message: `Could not resolve example reference "${referenceName}". Export a serializable value or inline the example instead.`,
        filePath: absoluteFilePath,
      },
    };
  }

  const value = evaluateSymbol(symbol, project.checker, new Set<string>());
  if (typeof value === "undefined") {
    return {
      diagnostic: {
        code: "example-reference-unserializable",
        severity: "warning",
        message: `Example reference "${referenceName}" could not be reduced to a serializable value. Use an exported literal, object, array, or schema.parse(...) result instead.`,
        filePath: absoluteFilePath,
      },
    };
  }

  return { value };
}

function findValueSymbol(
  referenceName: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  const symbols = checker.getSymbolsInScope(
    sourceFile,
    ts.SymbolFlags.Value | ts.SymbolFlags.Alias | ts.SymbolFlags.Variable | ts.SymbolFlags.Function,
  );
  const candidate = symbols.find((symbol) => symbol.name === referenceName);
  if (!candidate) {
    return undefined;
  }

  if (candidate.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(candidate);
  }

  return candidate;
}

function evaluateSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seen: Set<string>,
): unknown | undefined {
  const declaration = getResolvableDeclaration(symbol, checker);
  if (!declaration) {
    return undefined;
  }

  const symbolKey = getSymbolKey(symbol, declaration);
  if (seen.has(symbolKey)) {
    return undefined;
  }

  seen.add(symbolKey);
  const result = evaluateNode(declaration, checker, seen);
  seen.delete(symbolKey);
  return result;
}

function getResolvableDeclaration(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Node | undefined {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return (
    target.valueDeclaration ||
    target.declarations?.find(
      (declaration) =>
        ts.isVariableDeclaration(declaration) ||
        ts.isBindingElement(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isShorthandPropertyAssignment(declaration) ||
        ts.isFunctionDeclaration(declaration) ||
        ts.isEnumMember(declaration),
    )
  );
}

function getSymbolKey(symbol: ts.Symbol, declaration: ts.Node): string {
  return `${declaration.getSourceFile().fileName}:${declaration.pos}:${symbol.name}`;
}

function evaluateNode(
  node: ts.Node,
  checker: ts.TypeChecker,
  seen: Set<string>,
): unknown | undefined {
  if (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
    return node.initializer ? evaluateNode(node.initializer, checker, seen) : undefined;
  }

  if (ts.isPropertyAssignment(node)) {
    return evaluateNode(node.initializer, checker, seen);
  }

  if (ts.isShorthandPropertyAssignment(node)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(node);
    return symbol ? evaluateSymbol(symbol, checker, seen) : undefined;
  }

  if (ts.isParenthesizedExpression(node)) {
    return evaluateNode(node.expression, checker, seen);
  }

  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return evaluateNode(node.expression, checker, seen);
  }

  if (ts.isNonNullExpression(node)) {
    return evaluateNode(node.expression, checker, seen);
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evaluateNode(node.operand, checker, seen);
    if (typeof operand !== "number") {
      return undefined;
    }

    switch (node.operator) {
      case ts.SyntaxKind.MinusToken:
        return -operand;
      case ts.SyntaxKind.PlusToken:
        return operand;
      default:
        return undefined;
    }
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};

    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreadValue = evaluateNode(property.expression, checker, seen);
        if (!isRecord(spreadValue)) {
          return undefined;
        }

        Object.assign(result, spreadValue);
        continue;
      }

      const propertyName = getPropertyName(property.name);
      if (!propertyName) {
        return undefined;
      }

      const value = evaluateNode(property, checker, seen);
      if (typeof value !== "undefined") {
        result[propertyName] = value;
      }
    }

    return result;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const result: unknown[] = [];

    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const spreadValue = evaluateNode(element.expression, checker, seen);
        if (!Array.isArray(spreadValue)) {
          return undefined;
        }

        result.push(...spreadValue);
        continue;
      }

      result.push(evaluateNode(element, checker, seen));
    }

    return result;
  }

  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol ? evaluateSymbol(symbol, checker, seen) : undefined;
  }

  if (ts.isCallExpression(node)) {
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ["parse", "parseAsync"].includes(node.expression.name.text)
    ) {
      return node.arguments[0] ? evaluateNode(node.arguments[0], checker, seen) : undefined;
    }

    if (node.expression.getText() === "Object.freeze") {
      return node.arguments[0] ? evaluateNode(node.arguments[0], checker, seen) : undefined;
    }
  }

  if (ts.isEnumMember(node)) {
    if (node.initializer) {
      return evaluateNode(node.initializer, checker, seen);
    }

    return node.name.getText();
  }

  return undefined;
}

function getPropertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }

  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createConfiguredProject(configPath: string): TypeScriptProject {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  return {
    program,
    checker: program.getTypeChecker(),
    compilerOptions: parsedConfig.options,
  };
}

function createSingleFileProject(filePath: string): TypeScriptProject {
  const compilerOptions: ts.CompilerOptions = {
    allowJs: false,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
  };
  const program = ts.createProgram({
    rootNames: [filePath],
    options: compilerOptions,
  });

  return {
    program,
    checker: program.getTypeChecker(),
    compilerOptions,
  };
}
