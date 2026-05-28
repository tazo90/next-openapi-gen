import path from "path";
import type * as fs from "fs";
import * as t from "@babel/types";

import { buildFileSymbolIndex, type FileSymbolIndex } from "./symbol-index.js";
import { parseTypeScriptFile } from "./utils.js";
import { logger } from "./logger.js";

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
   * cannot be located on disk. Only relative imports are followed (package imports
   * are not the resolver's job). Results are memoized — including negative results.
   */
  public resolveImportPath(currentFilePath: string, importSource: string): string | null {
    const cacheKey = `${currentFilePath}::${importSource}`;
    if (this.importResolveCache.has(cacheKey)) {
      return this.importResolveCache.get(cacheKey) ?? null;
    }

    let resolved: string | null = null;
    if (importSource.startsWith(".")) {
      const pathOps = currentFilePath.startsWith("/") ? path.posix : path;
      const currentDir = pathOps.dirname(currentFilePath);
      const base = pathOps.resolve(currentDir, importSource);
      const extensions = [".ts", ".tsx", ".js", ".jsx"];

      if (!pathOps.extname(base)) {
        for (const ext of extensions) {
          const withExt = base + ext;
          if (this.fileAccess.existsSync(withExt)) {
            resolved = withExt;
            break;
          }
        }
        if (!resolved) {
          for (const ext of extensions) {
            const indexPath = pathOps.join(base, `index${ext}`);
            if (this.fileAccess.existsSync(indexPath)) {
              resolved = indexPath;
              break;
            }
          }
        }
      } else if (this.fileAccess.existsSync(base)) {
        resolved = base;
      }
    }

    this.importResolveCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Returns a simple literal value (string/number/boolean/null) for a `const` declarator,
   * following imports and re-exports when the name is not declared locally.
   */
  public resolveLiteral(filePath: string, name: string): ResolvedLiteral | undefined {
    const visited = new Set<string>();
    return this.resolveLiteralInternal(filePath, name, visited);
  }

  private resolveLiteralInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): ResolvedLiteral | undefined {
    if (visited.has(filePath)) return undefined;
    visited.add(filePath);

    const index = this.getIndex(filePath);
    if (!index) return undefined;

    const literal = index.constLiterals.get(name);
    if (literal) {
      if (t.isStringLiteral(literal)) return literal.value;
      if (t.isNumericLiteral(literal)) return literal.value;
      if (t.isBooleanLiteral(literal)) return literal.value;
      if (t.isNullLiteral(literal)) return null;
    }

    // Follow named imports
    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveLiteralInternal(resolved, targetName, visited);
        if (result !== undefined) return result;
      }
    }

    // Re-exports `export { Foo } from "..."`
    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveLiteralInternal(resolved, reExport.importedName, visited);
        if (result !== undefined) return result;
      }
    }

    // `export * from "..."`
    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveLiteralInternal(resolved, name, visited);
      if (result !== undefined) return result;
    }

    return undefined;
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
      const values: (string | number)[] = [];
      for (const element of constArr.elements) {
        if (t.isStringLiteral(element)) values.push(element.value);
        else if (t.isNumericLiteral(element)) values.push(element.value);
      }
      if (values.length > 0) return values;
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
    const arr = this.resolveConstArrayNode(filePath, name);
    if (!arr) return null;
    const values: (string | number)[] = [];
    for (const element of arr.elements) {
      if (t.isStringLiteral(element)) values.push(element.value);
      else if (t.isNumericLiteral(element)) values.push(element.value);
    }
    return values.length > 0 ? values : null;
  }

  /** Return the raw AST node for a const array declarator, following imports. */
  public resolveConstArrayNode(filePath: string, name: string): t.ArrayExpression | null {
    const visited = new Set<string>();
    return this.resolveConstArrayNodeInternal(filePath, name, visited);
  }

  private resolveConstArrayNodeInternal(
    filePath: string,
    name: string,
    visited: Set<string>,
  ): t.ArrayExpression | null {
    if (visited.has(filePath)) return null;
    visited.add(filePath);

    const index = this.getIndex(filePath);
    if (!index) return null;

    const local = index.constArrays.get(name);
    if (local) return local;

    const imports = this.getImports(filePath);
    const importInfo = imports?.get(name);
    if (importInfo) {
      const resolved = this.resolveImportPath(filePath, importInfo.source);
      if (resolved) {
        const targetName = importInfo.importedName === "default" ? name : importInfo.importedName;
        const result = this.resolveConstArrayNodeInternal(resolved, targetName, visited);
        if (result) return result;
      }
    }

    const reExport = index.namedReExports.get(name);
    if (reExport) {
      const resolved = this.resolveImportPath(filePath, reExport.source);
      if (resolved) {
        const result = this.resolveConstArrayNodeInternal(resolved, reExport.importedName, visited);
        if (result) return result;
      }
    }

    for (const starSrc of index.exportsStar) {
      const resolved = this.resolveImportPath(filePath, starSrc);
      if (!resolved) continue;
      const result = this.resolveConstArrayNodeInternal(resolved, name, visited);
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
