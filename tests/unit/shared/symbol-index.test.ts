import { describe, expect, it } from "vitest";

import { buildFileSymbolIndex } from "@workspace/openapi-core/shared/symbol-index.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("buildFileSymbolIndex", () => {
  it("indexes declarations, re-exports, and const wrappers", () => {
    const ast = parseTypeScriptFile(`
      export * from "./star";
      export { Foo as Bar } from "./reexport";
      const localName = 1;
      export { localName };
      export default function DefaultExport() {}
      export enum Status { Open, Closed }
      export type Id = string;
      export interface User { id: string }
      export interface User { name: string }
      export function helper() {}
      export const shape = { ok: true } as const;
      export const items = [1, 2] satisfies number[];
      export const label = "ready";
      export const count = 2;
      export const enabled = true;
      export const empty = null;
      export const run = () => 1;
      let mutable = { skipped: true };
      let skipped;
    `);

    const index = buildFileSymbolIndex(ast);

    expect(index.exportsStar).toEqual(["./star"]);
    expect(index.namedReExports.get("Bar")).toEqual({
      source: "./reexport",
      importedName: "Foo",
    });
    expect(index.namedExports.has("localName")).toBe(true);
    expect(index.tsEnums.has("Status")).toBe(true);
    expect(index.typeAliases.has("Id")).toBe(true);
    expect(index.interfaces.get("User")).toHaveLength(2);
    expect(index.functions.has("helper")).toBe(true);
    expect(index.functions.has("run")).toBe(true);
    expect(index.constObjects.has("shape")).toBe(true);
    expect(index.constArrays.has("items")).toBe(true);
    expect(index.constLiterals.has("label")).toBe(true);
    expect(index.constLiterals.has("count")).toBe(true);
    expect(index.constLiterals.has("enabled")).toBe(true);
    expect(index.constLiterals.has("empty")).toBe(true);
    expect(index.variables.has("mutable")).toBe(true);
    expect(index.variables.has("skipped")).toBe(false);
  });
});
