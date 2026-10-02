import type * as fs from "fs";
import path from "path";

import * as t from "@babel/types";

import { logger } from "./logger.js";
import { parseTypeScriptFile } from "./parse-typescript.js";
import { buildFileSymbolIndex, type FileSymbolIndex } from "./symbol-index.js";
import { resolveTypeScriptModule } from "./typescript-project.js";

export type SymbolResolverFileAccess = Pick<typeof fs, "existsSync" | "readFileSync">;

export type ResolvedLiteral = string | number | boolean | null;

export type ResolvedDeclaration = {
  node: t.Node;
  filePath: string;
  ast: t.File;
};

export type ImportInfo = {
  /** Module source string as written in the `import ... from "..."` */
  source: string;
  /** The original exported name (the name on the "from" side) */
  importedName: string;
  /** Local binding name in the importing file */
  localName: string;
  /** `true` for `import * as ns` default/namespace imports */
  isNamespace: boolean;
  /** `true` for `import foo` (default import) */
  isDefault: boolean;
};

export type FileImportMap = Map<string, ImportInfo>;

/** Caps identifier-to-identifier chasing so a pathological module graph cannot stall a run. */
const MAX_EVALUATION_DEPTH = 16;

/**
 * Shared cross-file symbol resolver.
 *
 * Centralizes every "given a name and a file, what AST does it refer to" lookup
 * across the Zod and TypeScript converters. Avoids re-parsing files, re-traversing
 * entire ASTs, and duplicated import-map bookkeeping.
 *
 * All caches are populated lazily and keyed by absolute file path.
 */
export class SymbolResolver {
  private readonly fileAccess: SymbolResolverFileAccess;
  private readonly astCache: Map<string, t.File>;
  private readonly indexCache: Map<string, FileSymbolIndex> = new Map();
  private readonly importCache: Map<string, FileImportMap> = new Map();
  private readonly missingFiles: Set<string> = new Set();
  private readonly importResolveCache: Map<string, string | null> = new Map();
  private readonly exportStarTargetsCache: Map<string, string[]> = new Map();

  constructor(fileAccess: SymbolResolverFileAccess, astCache?: Map<string, t.File>) {
    this.fileAccess = fileAccess;
    this.astCache = astCache ?? new Map();
  }

  /** Access the underlying AST cache so callers can share it. */
  public getASTCache(): Map<string, t.File> {
    return this.astCache;
  }

  /**
   * Parse a file (and cache the AST) or return `null` when the file cannot be read.
   */
  public parseFile(filePath: string): t.File | null {
    const cached = this.astCache.get(filePath);
    if (cached) return cached;
    if (this.missingFiles.has(filePath)) return null;

    try {
      if (!this.fileAccess.existsSync(filePath)) {
        this.missingFiles.add(filePath);
        return null;
      }
      const content = this.fileAccess.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);
      this.astCache.set(filePath, ast);
      return ast;
    } catch (error) {
      logger.debug(`[SymbolResolver] Error parsing '${filePath}': ${String(error)}`);
      this.missingFiles.add(filePath);
      return null;
    }
  }

  /** Register an externally-parsed AST. Useful for virtual files (tests). */
  public primeAST(filePath: string, ast: t.File): void {
    if (this.astCache.get(filePath) === ast) {
      this.missingFiles.delete(filePath);
      return;
    }
    this.astCache.set(filePath, ast);
    this.missingFiles.delete(filePath);
    this.indexCache.delete(filePath);
    this.importCache.delete(filePath);
  }

  /** Returns the symbol index for a file, parsing if needed. */
  public getIndex(filePath: string): FileSymbolIndex | null {
    const cached = this.indexCache.get(filePath);
    if (cached) return cached;
    const ast = this.parseFile(filePath);
    if (!ast) return null;
    const index = buildFileSymbolIndex(ast);
    this.indexCache.set(filePath, index);
    return index;
  }

  /** Returns the import map (local name -> ImportInfo) for a file. */
  public getImports(filePath: string): FileImportMap | null {
    const cached = this.importCache.get(filePath);
    if (cached) return cached;
    const ast = this.parseFile(filePath);
    if (!ast) return null;

    const map: FileImportMap = new Map();
    for (const statement of ast.program.body) {
      if (!t.isImportDeclaration(statement)) continue;
      const source = statement.source.value;
      for (const specifier of statement.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          map.set(specifier.local.name, {
            source,
            importedName: imported,
            localName: specifier.local.name,
            isNamespace: false,
            isDefault: false,
          });
        } else if (t.isImportDefaultSpecifier(specifier)) {
          map.set(specifier.local.name, {
            source,
            importedName: "default",
            localName: specifier.local.name,
            isNamespace: false,
            isDefault: true,
          });
        } else if (t.isImportNamespaceSpecifier(specifier)) {
          map.set(specifier.local.name, {
            source,
            importedName: "*",
            localName: specifier.local.name,
            isNamespace: true,
            isDefault: false,
          });
        }
      }
    }

    this.importCache.set(filePath, map);
    return map;
  }

  /**
   * Resolve an import source string to an absolute file path, or `null` when the path
   * cannot be located on disk. Relative imports are probed directly; everything else
   * goes through TypeScript module resolution, so `paths` aliases such as `@/constants`
   * follow the project's own configuration. Results are memoized — including negative
   * results.
   */
  public resolveImportPath(currentFilePath: string, importSource: string): string | null {
    const cacheKey = `${currentFilePath}::${importSource}`;
    if (this.importResolveCache.has(cacheKey)) {
      return this.importResolveCache.get(cacheKey) ?? null;
    }

    let resolved: string | null;
    if (importSource.startsWith(".")) {
      const pathOps = currentFilePath.startsWith("/") ? path.posix : path;
      const currentDir = pathOps.dirname(currentFilePath);
      resolved = this.resolveFileCandidate(pathOps.resolve(currentDir, importSource), pathOps);
    } else {
      const module = resolveTypeScriptModule(importSource, currentFilePath);
      resolved = module && !/[\\/]node_modules[\\/]/.test(module) ? module : null;
    }

    this.importResolveCache.set(cacheKey, resolved);
    return resolved;
  }

  private resolveFileCandidate(base: string, pathOps: typeof path.posix): string | null {
    const extensions = [".ts", ".tsx", ".js", ".jsx"];
    if (extensions.some((extension) => base.endsWith(extension))) {
      return this.fileAccess.existsSync(base) ? base : null;
    }

    for (const extension of extensions) {
      const withExtension = base + extension;
      if (this.fileAccess.existsSync(withExtension)) return withExtension;
    }
    for (const extension of extensions) {
      const indexPath = pathOps.join(base, `index${extension}`);
      if (this.fileAccess.existsSync(indexPath)) return indexPath;
    }

    // Extensions we do not probe for, such as `./limits.mts`.
    return this.fileAccess.existsSync(base) ? base : null;
  }

  /**
   * Returns a simple literal value (string/number/boolean/null) for a `const` declarator,
   * following imports and re-exports when the name is not declared locally. Arithmetic,
   * template-literal and aliasing initializers are evaluated.
   */
  public resolveLiteral(filePath: string, name: string): ResolvedLiteral | undefined {
    return this.resolveLiteralInternal(filePath, name, new Set(), 0);
  }

  /**
   * Statically evaluate an expression as seen from `filePath`: literals, `as const`
   * wrappers, arithmetic, template literals, and identifiers referring to constants
   * anywhere in the resolvable module graph.
   */
  public evaluateExpression(
    filePath: string | undefined,
    node: t.Node,
  ): ResolvedLiteral | undefined {
    return this.evaluateNode(filePath, node, new Set(), 0);
  }

  private resolveLiteralInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
    depth: number,
  ): ResolvedLiteral | undefined {
    const key = `${filePath}::${name}`;
    if (depth > MAX_EVALUATION_DEPTH || visited.has(key)) return undefined;

    // Guards the current path only; sibling expressions may name the same constant.
    visited.add(key);
    try {
      return this.resolveDeclaredLiteral(filePath, name, visited, depth);
    } finally {
      visited.delete(key);
    }
  }

  private resolveDeclaredLiteral(
    filePath: string,
    name: string,
    visited: Set<string>,
    depth: number,
  ): ResolvedLiteral | undefined {
    const index = this.getIndex(filePath);
    if (!index) return undefined;

    const literal = index.constLiterals.get(name);
    if (literal) {
      if (t.isStringLiteral(literal)) return literal.value;
      if (t.isNumericLiteral(literal)) return literal.value;
      if (t.isBooleanLiteral(literal)) return literal.value;
      if (t.isNullLiteral(literal)) return null;
    }

    const expression = index.constExpressions.get(name);
    if (expression) {
      const value = this.evaluateNode(filePath, expression, visited, depth + 1);
      if (value !== undefined) return value;
    }

    // Follow named imports
    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveLiteralInternal(resolved, targetName, visited, depth + 1);
        if (result !== undefined) return result;
      }
    }

    // Re-exports `export { Foo } from "..."`
    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveLiteralInternal(
          resolved,
          reExport.importedName,
          visited,
          depth + 1,
        );
        if (result !== undefined) return result;
      }
    }

    // `export * from "..."`
    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveLiteralInternal(resolved, name, visited, depth + 1);
      if (result !== undefined) return result;
    }

    return undefined;
  }

  private evaluateNode(
    filePath: string | undefined,
    node: t.Node,
    visited: Set<string>,
    depth: number,
  ): ResolvedLiteral | undefined {
    if (depth > MAX_EVALUATION_DEPTH) return undefined;

    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;

    if (
      t.isTSAsExpression(node) ||
      t.isTSSatisfiesExpression(node) ||
      t.isParenthesizedExpression(node)
    ) {
      return this.evaluateNode(filePath, node.expression, visited, depth + 1);
    }

    if (t.isIdentifier(node)) {
      // Without a file there is nothing to look a name up in.
      return filePath
        ? this.resolveLiteralInternal(filePath, node.name, visited, depth + 1)
        : undefined;
    }

    if (t.isBinaryExpression(node)) {
      return this.evaluateArithmetic(filePath, node, visited, depth);
    }

    if (t.isTemplateLiteral(node)) {
      let result = "";
      for (const [position, quasi] of node.quasis.entries()) {
        result += quasi.value.cooked ?? quasi.value.raw;
        const expression = node.expressions[position];
        if (!expression) continue;
        const value = this.evaluateNode(filePath, expression, visited, depth + 1);
        if (value === undefined) return undefined;
        result += String(value);
      }
      return result;
    }

    return undefined;
  }

  private evaluateArithmetic(
    filePath: string | undefined,
    node: t.BinaryExpression,
    visited: Set<string>,
    depth: number,
  ): number | undefined {
    if (t.isPrivateName(node.left)) return undefined;
    const left = this.evaluateNode(filePath, node.left, visited, depth + 1);
    const right = this.evaluateNode(filePath, node.right, visited, depth + 1);
    if (typeof left !== "number" || typeof right !== "number") return undefined;

    // Widened: only four of the many binary operators produce a constant we can use.
    const operator: string = node.operator;
    let value: number;
    switch (operator) {
      case "+":
        value = left + right;
        break;
      case "-":
        value = left - right;
        break;
      case "*":
        value = left * right;
        break;
      case "/":
        value = left / right;
        break;
      default:
        return undefined;
    }
    return Number.isFinite(value) ? value : undefined;
  }

  /**
   * Extract enum-like values from a TS enum declaration or an `as const` object/array.
   * Follows imports and `export * from "..."` one hop, with negative caching.
   */
  public resolveEnumValues(filePath: string, name: string): (string | number)[] | null {
    const visited = new Set<string>();
    return this.resolveEnumValuesInternal(filePath, name, visited);
  }

  private resolveEnumValuesInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): (string | number)[] | null {
    if (visited.has(filePath)) return null;
    visited.add(filePath);

    const index = this.getIndex(filePath);
    if (!index) return null;

    // 1. TS enum declarations
    const enumDecl = index.tsEnums.get(name);
    if (enumDecl) {
      const values: (string | number)[] = [];
      for (const member of enumDecl.members) {
        if (!member.initializer) continue;
        if (t.isStringLiteral(member.initializer)) {
          values.push(member.initializer.value);
        } else if (t.isNumericLiteral(member.initializer)) {
          values.push(member.initializer.value);
        }
      }
      if (values.length > 0) return values;
    }

    // 2. `as const` objects
    const constObj = index.constObjects.get(name);
    if (constObj) {
      const values: (string | number)[] = [];
      for (const prop of constObj.properties) {
        if (!t.isObjectProperty(prop)) continue;
        if (t.isStringLiteral(prop.value)) values.push(prop.value.value);
        else if (t.isNumericLiteral(prop.value)) values.push(prop.value.value);
      }
      if (values.length > 0) return values;
    }

    // 3. `as const` arrays
    const constArr = index.constArrays.get(name);
    if (constArr) {
      const values = this.readArrayValues(constArr, filePath, new Set([constArr]));
      return values && values.length > 0 ? values : null;
    }

    // 4. Follow named imports
    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveEnumValuesInternal(resolved, targetName, visited);
        if (result) return result;
      }
    }

    // 5. Re-exports `export { Foo } from "..."`
    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveEnumValuesInternal(resolved, reExport.importedName, visited);
        if (result) return result;
      }
    }

    // 6. `export * from "..."` (one hop at a time, but cached)
    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveEnumValuesInternal(resolved, name, visited);
      if (result) return result;
    }

    return null;
  }

  /** Resolve a name to its const object AST node in this file or a re-exporting file. */
  public resolveConstObject(filePath: string, name: string): t.ObjectExpression | null {
    const visited = new Set<string>();
    return this.resolveConstObjectInternal(filePath, name, visited);
  }

  private resolveConstObjectInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): t.ObjectExpression | null {
    if (visited.has(filePath)) return null;
    visited.add(filePath);

    const index = this.getIndex(filePath);
    if (!index) return null;
    const local = index.constObjects.get(name);
    if (local) return local;

    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveConstObjectInternal(resolved, targetName, visited);
        if (result) return result;
      }
    }

    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveConstObjectInternal(resolved, reExport.importedName, visited);
        if (result) return result;
      }
    }

    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveConstObjectInternal(resolved, name, visited);
      if (result) return result;
    }

    return null;
  }

  /** Return the literal string/number values of a const array declarator, following imports. */
  public resolveConstArrayValues(filePath: string, name: string): (string | number)[] | null {
    const declaration = this.resolveConstArrayDeclaration(filePath, name, new Set());
    if (!declaration) return null;
    const values = this.readArrayValues(
      declaration.node,
      declaration.filePath,
      new Set([declaration.node]),
    );
    return values && values.length > 0 ? values : null;
  }

  /**
   * Literal values of a const array, following `...NAME` spreads of other const arrays.
   * `null` when any element is not static, so a partial list is never reported as complete.
   */
  private readArrayValues(
    array: t.ArrayExpression,
    filePath: string,
    expanding: Set<t.ArrayExpression>,
  ): (string | number)[] | null {
    const values: (string | number)[] = [];
    for (const element of array.elements) {
      if (t.isStringLiteral(element) || t.isNumericLiteral(element)) {
        values.push(element.value);
      } else if (t.isSpreadElement(element) && t.isIdentifier(element.argument)) {
        const spread = this.resolveConstArrayDeclaration(
          filePath,
          element.argument.name,
          new Set(),
        );
        if (!spread || expanding.has(spread.node)) return null;
        expanding.add(spread.node);
        const spreadValues = this.readArrayValues(spread.node, spread.filePath, expanding);
        expanding.delete(spread.node);
        if (!spreadValues) return null;
        values.push(...spreadValues);
      } else {
        return null;
      }
    }
    return values;
  }

  /** Return the raw AST node for a const array declarator, following imports. */
  public resolveConstArrayNode(filePath: string, name: string): t.ArrayExpression | null {
    return this.resolveConstArrayDeclaration(filePath, name, new Set())?.node ?? null;
  }

  private resolveConstArrayDeclaration(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): { node: t.ArrayExpression; filePath: string } | null {
    if (visited.has(filePath)) return null;
    visited.add(filePath);

    const index = this.getIndex(filePath);
    if (!index) return null;

    const local = index.constArrays.get(name);
    if (local) return { node: local, filePath };

    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveConstArrayDeclaration(resolved, targetName, visited);
        if (result) return result;
      }
    }

    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveConstArrayDeclaration(resolved, reExport.importedName, visited);
        if (result) return result;
      }
    }

    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveConstArrayDeclaration(resolved, name, visited);
      if (result) return result;
    }

    return null;
  }

  /**
   * Extract the string keys of a mask literal such as `{ id: true, name: true }`
   * used with `.pick` / `.omit` / `.partial` / `.required`.
   */
  public resolveMaskKeys(filePath: string, name: string): string[] | null {
    const obj = this.resolveConstObject(filePath, name);
    if (!obj) return null;
    const keys: string[] = [];
    for (const prop of obj.properties) {
      if (!t.isObjectProperty(prop)) continue;
      if (t.isIdentifier(prop.key)) keys.push(prop.key.name);
      else if (t.isStringLiteral(prop.key)) keys.push(prop.key.value);
    }
    return keys.length > 0 ? keys : null;
  }

  /**
   * Resolve a name to a declared node across the full resolver graph:
   *   - local variables / functions / types / interfaces / enums
   *   - imports (one hop, then N hops via cache)
   *   - `export * from "..."` star re-exports
   *   - `export { X } from "..."` named re-exports
   *
   * Return the declaration node along with the file it lives in, or `null` on miss.
   */
  public resolveDeclaration(filePath: string, name: string): ResolvedDeclaration | null {
    const visited = new Set<string>();
    return this.resolveDeclarationInternal(filePath, name, visited);
  }

  private resolveDeclarationInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): ResolvedDeclaration | null {
    if (visited.has(filePath + "::" + name)) return null;
    visited.add(filePath + "::" + name);

    const index = this.getIndex(filePath);
    if (!index) return null;
    const ast = this.astCache.get(filePath);
    if (!ast) return null;

    const local =
      index.tsEnums.get(name) ??
      index.typeAliases.get(name) ??
      index.interfaces.get(name)?.[0] ??
      index.functions.get(name) ??
      index.variables.get(name) ??
      index.namedExports.get(name);
    if (local) {
      return { node: local, filePath, ast };
    }

    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveDeclarationInternal(resolved, targetName, visited);
        if (result) return result;
      }
    }

    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveDeclarationInternal(resolved, reExport.importedName, visited);
        if (result) return result;
      }
    }

    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveDeclarationInternal(resolved, name, visited);
      if (result) return result;
    }

    return null;
  }

  /**
   * Invalidate all caches for a specific file (useful when a file changes on disk
   * during watch mode).
   */
  public invalidateFile(filePath: string): void {
    this.astCache.delete(filePath);
    this.indexCache.delete(filePath);
    this.importCache.delete(filePath);
    this.missingFiles.delete(filePath);
    for (const key of Array.from(this.importResolveCache.keys())) {
      if (key.startsWith(filePath + "::")) {
        this.importResolveCache.delete(key);
      }
    }
    this.exportStarTargetsCache.delete(filePath);
  }

  /** Clear every cache. */
  public clear(): void {
    this.astCache.clear();
    this.indexCache.clear();
    this.importCache.clear();
    this.missingFiles.clear();
    this.importResolveCache.clear();
    this.exportStarTargetsCache.clear();
  }
}
