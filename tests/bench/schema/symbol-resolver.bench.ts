import { bench, describe } from "vitest";

import { SymbolResolver } from "@workspace/openapi-core/shared/symbol-resolver.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

/**
 * Micro-benchmarks for the SymbolResolver. Uses an in-memory `FileAccess`
 * shim so we measure only the indexing + lookup pipeline.
 */

const enumFile = `
export enum Role {
  ADMIN = "admin",
  MEMBER = "member",
  GUEST = "guest",
}

export const Statuses = ["active", "inactive", "banned"] as const;
export const Shape = { id: true, name: true } as const;
export const Constant = 42;
`;

const barrelFile = `
export { Role, Statuses, Shape, Constant } from "./values";
export * from "./other";
`;

const otherFile = `
export const OtherValues = ["x", "y"] as const;
`;

function createFileAccess(files: Record<string, string>) {
  return {
    readFileSync: (filePath: string) => {
      const file = files[filePath];
      if (!file) throw new Error(`missing ${filePath}`);
      return file;
    },
    existsSync: (filePath: string) => filePath in files,
  };
}

function primeResolver(resolver: SymbolResolver, files: Record<string, string>) {
  for (const [filePath, source] of Object.entries(files)) {
    resolver.primeAST(filePath, parseTypeScriptFile(source));
  }
}

describe("SymbolResolver micro-benches", () => {
  const files = {
    "/virtual/values.ts": enumFile,
    "/virtual/barrel.ts": barrelFile,
    "/virtual/other.ts": otherFile,
  };

  bench("resolveEnumValues — enum declaration", () => {
    const resolver = new SymbolResolver(createFileAccess(files));
    primeResolver(resolver, files);
    resolver.resolveEnumValues("/virtual/values.ts", "Role");
  });

  bench("resolveEnumValues — as-const array", () => {
    const resolver = new SymbolResolver(createFileAccess(files));
    primeResolver(resolver, files);
    resolver.resolveEnumValues("/virtual/values.ts", "Statuses");
  });

  bench("resolveMaskKeys — as-const mask object", () => {
    const resolver = new SymbolResolver(createFileAccess(files));
    primeResolver(resolver, files);
    resolver.resolveMaskKeys("/virtual/values.ts", "Shape");
  });

  bench("resolveLiteral — const literal", () => {
    const resolver = new SymbolResolver(createFileAccess(files));
    primeResolver(resolver, files);
    resolver.resolveLiteral("/virtual/values.ts", "Constant");
  });

  bench("getIndex — second call (cached)", () => {
    const resolver = new SymbolResolver(createFileAccess(files));
    primeResolver(resolver, files);
    resolver.getIndex("/virtual/values.ts");
    resolver.getIndex("/virtual/values.ts");
  });
});
