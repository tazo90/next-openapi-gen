import { describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";
import { SymbolResolver } from "@workspace/openapi-core/shared/symbol-resolver.js";

const files = new Map<string, string>([
  [
    "/app/schemas.ts",
    `
      export const Status = { Active: "active", Archived: "archived" } as const;
      export enum Role { Admin = "admin", Member = "member" }
      export const LIMIT = 10;
      export const FLAG = true;
      export const EMPTY = null;
    `,
  ],
  [
    "/app/user.ts",
    `
      import { Status, Role, LIMIT } from "./schemas";
      export const mask = { id: true, name: true } as const;
    `,
  ],
]);

const fileAccess = {
  existsSync: (filePath: string) => files.has(filePath),
  readFileSync: (filePath: string) => {
    const content = files.get(filePath);
    if (!content) {
      throw new Error(`Missing ${filePath}`);
    }
    return content;
  },
};

describe("SymbolResolver", () => {
  it("parses, caches, and resolves literals and enums", () => {
    const resolver = new SymbolResolver(fileAccess);

    expect(resolver.parseFile("/missing.ts")).toBeNull();
    expect(resolver.parseFile("/app/schemas.ts")).toBeTruthy();
    expect(resolver.parseFile("/app/schemas.ts")).toBe(
      resolver.getASTCache().get("/app/schemas.ts"),
    );

    expect(resolver.resolveLiteral("/app/schemas.ts", "LIMIT")).toBe(10);
    expect(resolver.resolveLiteral("/app/schemas.ts", "FLAG")).toBe(true);
    expect(resolver.resolveLiteral("/app/schemas.ts", "EMPTY")).toBeNull();
    expect(resolver.resolveEnumValues("/app/schemas.ts", "Role")).toEqual(["admin", "member"]);
    expect(resolver.resolveEnumValues("/app/schemas.ts", "Status")).toEqual(["active", "archived"]);
  });

  it("primes virtual ASTs and resolves imported mask keys", () => {
    const resolver = new SymbolResolver(fileAccess);
    resolver.primeAST("/virtual.ts", parseTypeScriptFile("export const value = 1;"));
    expect(resolver.resolveLiteral("/virtual.ts", "value")).toBe(1);

    expect(resolver.resolveMaskKeys("/app/user.ts", "mask")).toEqual(["id", "name"]);
    expect(resolver.getImports("/app/user.ts")?.get("Status")?.source).toBe("./schemas");
  });

  it("resolves imports, re-exports, declarations, and cache invalidation", () => {
    const graph = new Map<string, string>([
      [
        "/lib/values.ts",
        `
          export const LABEL = "ok";
          export const COUNTS = [1, 2] as const;
          export const FLAGS = { debug: 1, verbose: 2 } as const;
          export type User = { id: string };
          export function helper() {}
        `,
      ],
      [
        "/lib/index.ts",
        `
          export { LABEL as Title, COUNTS, FLAGS, User, helper } from "./values";
          export * from "./values";
        `,
      ],
      [
        "/app/import.ts",
        `
          import LABEL, { COUNTS as Totals, FLAGS, User, helper } from "../lib/values";
          import * as values from "../lib/values";
          export const copied = LABEL;
        `,
      ],
      [
        "/app/star.ts",
        `
          export * from "../lib/values";
        `,
      ],
      [
        "/app/named.ts",
        `
          export { LABEL as Title } from "../lib/values";
        `,
      ],
    ]);
    const access = {
      existsSync: (filePath: string) =>
        graph.has(filePath) || filePath === "/lib/values.ts" || filePath === "/lib/index.ts",
      readFileSync: (filePath: string) => {
        const content = graph.get(filePath);
        if (!content) {
          throw new Error(`Missing ${filePath}`);
        }
        return content;
      },
    };
    const resolver = new SymbolResolver(access);

    expect(resolver.resolveLiteral("/app/named.ts", "Title")).toBe("ok");
    expect(resolver.resolveLiteral("/app/star.ts", "LABEL")).toBe("ok");
    expect(resolver.resolveLiteral("/app/import.ts", "LABEL")).toBe("ok");
    expect(resolver.resolveLiteral("/app/import.ts", "missing")).toBeUndefined();
    expect(resolver.resolveEnumValues("/app/star.ts", "FLAGS")).toEqual([1, 2]);
    expect(resolver.resolveEnumValues("/app/named.ts", "Title")).toBeNull();
    expect(resolver.resolveConstArrayValues("/app/star.ts", "COUNTS")).toEqual([1, 2]);
    expect(resolver.resolveConstObject("/app/star.ts", "FLAGS")).toMatchObject({
      type: "ObjectExpression",
    });
    expect(resolver.resolveDeclaration("/app/star.ts", "User")?.filePath).toBe("/lib/values.ts");
    expect(resolver.resolveDeclaration("/app/named.ts", "Title")?.filePath).toBe("/lib/values.ts");
    expect(resolver.resolveImportPath("/app/import.ts", "../lib/values")).toBe("/lib/values.ts");
    expect(resolver.resolveImportPath("/app/import.ts", "../lib/values")).toBe("/lib/values.ts");
    expect(resolver.resolveImportPath("/app/import.ts", "zod")).toBeNull();
    expect(resolver.getImports("/app/import.ts")?.get("Totals")?.importedName).toBe("COUNTS");
    expect(resolver.getImports("/app/import.ts")?.get("values")?.isNamespace).toBe(true);

    resolver.invalidateFile("/lib/values.ts");
    resolver.clear();
    expect(resolver.getIndex("/missing.ts")).toBeNull();
  });

  it("returns null for unreadable files and unknown symbols", () => {
    const resolver = new SymbolResolver({
      existsSync: () => {
        throw new Error("boom");
      },
      readFileSync: () => {
        throw new Error("boom");
      },
    });

    expect(resolver.parseFile("/broken.ts")).toBeNull();
    expect(resolver.getIndex("/broken.ts")).toBeNull();
    expect(resolver.resolveLiteral("/app/schemas.ts", "missing")).toBeUndefined();
  });

  it("resolves extensions, index files, defaults, and circular re-exports", () => {
    const graph = new Map<string, string>([
      [
        "/pkg/values.ts",
        `
          export const LABEL = "ok";
          export const COUNTS = ["a", 2] as const;
          export const MASK = { id: true, "full-name": true } as const;
          export const Defaults = { debug: 1 } as const;
          export default Defaults;
          export enum Empty {}
          export interface Profile { id: string }
        `,
      ],
      [
        "/pkg/index.ts",
        `
          export { LABEL, COUNTS, MASK, Empty, Profile, Defaults } from "./values";
          export { default } from "./values";
        `,
      ],
      [
        "/app/loop-a.ts",
        `
          export * from "./loop-b";
        `,
      ],
      [
        "/app/loop-b.ts",
        `
          export * from "./loop-a";
        `,
      ],
      [
        "/app/import.ts",
        `
          import Defaults, { LABEL, COUNTS as Totals, MASK, Empty, Profile } from "../pkg";
          export const copied = LABEL;
        `,
      ],
    ]);
    const access = {
      existsSync: (filePath: string) => graph.has(filePath),
      readFileSync: (filePath: string) => {
        const content = graph.get(filePath);
        if (!content) {
          throw new Error(`Missing ${filePath}`);
        }
        return content;
      },
    };
    const sharedAst = new Map();
    const resolver = new SymbolResolver(access, sharedAst);

    expect(resolver.resolveImportPath("/app/import.ts", "../pkg")).toBe("/pkg/index.ts");
    expect(resolver.resolveImportPath("/app/import.ts", "../pkg/values.ts")).toBe("/pkg/values.ts");
    expect(resolver.resolveImportPath("/app/import.ts", "../pkg/missing.ts")).toBeNull();
    expect(resolver.resolveLiteral("/app/import.ts", "LABEL")).toBe("ok");
    expect(resolver.resolveConstArrayValues("/app/import.ts", "Totals")).toEqual(["a", 2]);
    expect(resolver.resolveMaskKeys("/app/import.ts", "MASK")).toEqual(["id", "full-name"]);
    expect(resolver.resolveEnumValues("/app/import.ts", "Empty")).toBeNull();
    expect(resolver.resolveConstObject("/app/import.ts", "Defaults")).toMatchObject({
      type: "ObjectExpression",
    });
    expect(resolver.resolveDeclaration("/app/import.ts", "Profile")?.filePath).toBe(
      "/pkg/values.ts",
    );
    expect(resolver.resolveLiteral("/app/loop-a.ts", "LABEL")).toBeUndefined();
    expect(resolver.resolveEnumValues("/app/loop-a.ts", "Empty")).toBeNull();
    expect(resolver.resolveConstObject("/app/loop-a.ts", "MASK")).toBeNull();
    expect(resolver.resolveConstArrayNode("/app/loop-a.ts", "COUNTS")).toBeNull();
    expect(resolver.resolveDeclaration("/app/loop-a.ts", "Profile")).toBeNull();
    expect(resolver.getASTCache()).toBe(sharedAst);
  });

  it("covers leftover unresolved star-exports, default imports, and missing declarations", () => {
    const graph = new Map<string, string>([
      [
        "/app/star-missing.ts",
        `
          export * from "missing-package";
          export * from "./nope";
          import value from "./missing-default";
          export const copied = value;
        `,
      ],
      [
        "/app/empty.ts",
        `
          export {};
        `,
      ],
    ]);
    const access = {
      existsSync: (filePath: string) => graph.has(filePath),
      readFileSync: (filePath: string) => {
        const content = graph.get(filePath);
        if (!content) {
          throw new Error(`Missing ${filePath}`);
        }
        return content;
      },
    };
    const resolver = new SymbolResolver(access);

    expect(resolver.resolveLiteral("/app/star-missing.ts", "LABEL")).toBeUndefined();
    expect(resolver.resolveEnumValues("/app/star-missing.ts", "Role")).toBeNull();
    expect(resolver.resolveConstArrayValues("/app/empty.ts", "COUNTS")).toBeNull();
    expect(resolver.resolveConstObject("/app/empty.ts", "FLAGS")).toBeNull();
    expect(resolver.resolveDeclaration("/app/empty.ts", "User")).toBeNull();
    expect(resolver.resolveMaskKeys("/app/empty.ts", "mask")).toBeNull();
    expect(resolver.getImports("/app/star-missing.ts")?.get("value")?.isDefault).toBe(true);
  });

  it("covers leftover import specifiers, namespace imports, and cached misses", () => {
    const graph = new Map<string, string>([
      [
        "/app/imports.ts",
        `
          import * as values from "./values";
          import { "full-name" as fullName } from "./values";
          export const copied = values.LABEL;
        `,
      ],
      [
        "/app/values.ts",
        `
          export const LABEL = "ok";
        `,
      ],
    ]);
    const access = {
      existsSync: (filePath: string) => graph.has(filePath),
      readFileSync: (filePath: string) => {
        const content = graph.get(filePath);
        if (!content) {
          throw new Error(`Missing ${filePath}`);
        }
        return content;
      },
    };
    const resolver = new SymbolResolver(access);

    expect(resolver.getImports("/app/imports.ts")?.get("values")).toMatchObject({
      isNamespace: true,
      importedName: "*",
    });
    expect(resolver.getImports("/app/imports.ts")?.get("fullName")).toMatchObject({
      importedName: "full-name",
    });
    expect(resolver.getImports("/missing.ts")).toBeNull();
    expect(resolver.resolveImportPath("/app/imports.ts", "./missing")).toBeNull();
    expect(resolver.resolveImportPath("/app/imports.ts", "./missing")).toBeNull();
    expect(resolver.resolveImportPath("C:\\\\app\\\\imports.ts", "./values")).toBeNull();
  });

  it("covers leftover null literals, numeric enums, and imported enum values", () => {
    const graph = new Map<string, string>([
      [
        "/app/enums.ts",
        `
          export enum Role { Admin = 1, User = 2, Empty }
          export const FLAGS = { a: 1, b: "x", skip() {} } as const;
          export const COUNTS = [1, "a"] as const;
          export const NULL_VALUE = null;
          export const EMPTY_ENUM = {};
          export const EMPTY_ARRAY = [] as const;
        `,
      ],
      [
        "/app/reexport.ts",
        `
          import { NULL_VALUE, Role, FLAGS, COUNTS } from "./enums";
          export { Role } from "./enums";
          export * from "./enums";
          export const copied = NULL_VALUE;
        `,
      ],
    ]);
    const access = {
      existsSync: (filePath: string) => graph.has(filePath),
      readFileSync: (filePath: string) => {
        const content = graph.get(filePath);
        if (!content) {
          throw new Error(`Missing ${filePath}`);
        }
        return content;
      },
    };
    const resolver = new SymbolResolver(access);

    expect(resolver.resolveLiteral("/app/enums.ts", "NULL_VALUE")).toBeNull();
    expect(resolver.resolveLiteral("/app/reexport.ts", "NULL_VALUE")).toBeNull();
    expect(resolver.resolveEnumValues("/app/enums.ts", "Role")).toEqual([1, 2]);
    expect(resolver.resolveEnumValues("/app/enums.ts", "FLAGS")).toEqual([1, "x"]);
    expect(resolver.resolveEnumValues("/app/enums.ts", "COUNTS")).toEqual([1, "a"]);
    expect(resolver.resolveEnumValues("/app/reexport.ts", "Role")).toEqual([1, 2]);
    expect(resolver.resolveEnumValues("/app/reexport.ts", "FLAGS")).toEqual([1, "x"]);
    expect(resolver.resolveEnumValues("/missing.ts", "Role")).toBeNull();
    expect(resolver.resolveEnumValues("/app/enums.ts", "EMPTY_ENUM")).toBeNull();
  });
});
