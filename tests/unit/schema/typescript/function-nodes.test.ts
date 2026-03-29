import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  extractFunctionParameters,
  extractFunctionReturnType,
} from "@workspace/openapi-core/schema/typescript/function-nodes.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("TypeScript function node helpers", () => {
  it("extracts return types and parameters from supported function shapes", () => {
    const ast = parseTypeScriptFile(`
      export function declared(value: string): number { return value.length; }
      const assigned = (count: number): boolean => count > 0;
      const anonymous = function (input: string): string { return input; };
    `);
    const [declaredFn, assignedDecl, anonymousDecl] = ast.program.body;

    if (!declaredFn || !t.isExportNamedDeclaration(declaredFn) || !declaredFn.declaration) {
      throw new Error("Expected exported declaration");
    }
    if (!t.isFunctionDeclaration(declaredFn.declaration)) {
      throw new Error("Expected function declaration");
    }
    if (!assignedDecl || !t.isVariableDeclaration(assignedDecl)) {
      throw new Error("Expected variable declaration");
    }
    if (!anonymousDecl || !t.isVariableDeclaration(anonymousDecl)) {
      throw new Error("Expected variable declaration");
    }

    expect(t.isTSNumberKeyword(extractFunctionReturnType(declaredFn.declaration))).toBe(true);
    expect(t.isTSBooleanKeyword(extractFunctionReturnType(assignedDecl.declarations[0]))).toBe(
      true,
    );
    expect(
      t.isTSStringKeyword(extractFunctionReturnType(anonymousDecl.declarations[0]?.init)),
    ).toBe(true);
    expect(extractFunctionReturnType(t.identifier("noop"))).toBeNull();

    expect(extractFunctionParameters(declaredFn.declaration)).toHaveLength(1);
    expect(extractFunctionParameters(assignedDecl.declarations[0])).toHaveLength(1);
    expect(extractFunctionParameters(anonymousDecl.declarations[0]?.init)).toHaveLength(1);
    expect(extractFunctionParameters(t.identifier("noop"))).toEqual([]);
  });
});
