import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  resolveGenericType,
  resolveGenericTypeFromString,
  resolveTypeWithSubstitution,
  type GenericTypeHost,
} from "@workspace/openapi-core/schema/typescript/generic-types.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

function parseDeclaration(source: string): t.Statement {
  const ast = parseTypeScriptFile(source);
  const statement = ast.program.body[0];
  if (!statement) {
    throw new Error("Expected a declaration");
  }
  return statement;
}

function createHost(overrides: Partial<GenericTypeHost> = {}): GenericTypeHost {
  return {
    contentType: "response",
    findSchemaDefinition: () => ({ type: "object" }),
    isGenericTypeParameter: () => false,
    openapiDefinitions: {},
    resolveGenericType: () => ({ type: "object" }),
    resolveTSNodeType: (node) => {
      if (t.isTSStringKeyword(node)) return { type: "string" };
      if (t.isTSNumberKeyword(node)) return { type: "number" };
      if (t.isTSBooleanKeyword(node)) return { type: "boolean" };
      return { type: "object" };
    },
    scanAllSchemaDirs: () => {},
    typeDefinitions: {},
    ...overrides,
  };
}

describe("generic-types", () => {
  it("resolves generic aliases, interfaces, and leftover substitution branches", () => {
    const alias = parseDeclaration("type Box<T> = { value: T; label?: string };");
    const iface = parseDeclaration("interface BoxI<T> { value: T; extra?: number }");
    const host = createHost({
      openapiDefinitions: {
        User: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
      findSchemaDefinition(name) {
        if (name === "Missing") {
          return { type: "object" };
        }
        return { type: "object", properties: { id: { type: "string" } } };
      },
    });

    expect(
      resolveGenericType(host, alias, [t.tsTypeReference(t.identifier("User"))], "Box"),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        label: expect.objectContaining({ type: "string" }),
      }),
    });
    expect(resolveGenericType(host, iface, [t.tsStringKeyword()], "BoxI")).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        extra: expect.objectContaining({ type: "number" }),
      }),
    });
    expect(resolveGenericType(host, t.identifier("Nope"), [], "Nope")).toEqual({});

    const weirdAlias = parseDeclaration("type Weird<T> = {};") as t.TSTypeAliasDeclaration;
    weirdAlias.typeParameters?.params.push({ type: "Identifier", name: "Extra" } as never);
    weirdAlias.typeParameters?.params.push({ name: { name: "Nested" } } as never);
    expect(resolveGenericType(host, weirdAlias, [t.tsStringKeyword()], "Weird")).toEqual({
      type: "object",
      properties: {},
    });

    const weirdIface = parseDeclaration("interface WeirdI<T> {}") as t.TSInterfaceDeclaration;
    weirdIface.typeParameters?.params.push({ type: "Identifier", name: "Extra" } as never);
    weirdIface.typeParameters?.params.push({ name: { name: "Nested" } } as never);
    expect(resolveGenericType(host, weirdIface, [t.tsStringKeyword()], "WeirdI")).toEqual({
      type: "object",
      properties: {},
    });

    expect(resolveTypeWithSubstitution(host, null, {})).toEqual({ type: "object" });
    expect(
      resolveTypeWithSubstitution(host, t.tsTypeReference(t.identifier("T")), {
        T: t.tsTypeReference(t.identifier("User")),
      }),
    ).toEqual(host.openapiDefinitions.User);
    expect(
      resolveTypeWithSubstitution(host, t.tsTypeReference(t.identifier("T")), {
        T: t.tsTypeReference(t.identifier("Missing")),
      }),
    ).toEqual({});
    expect(
      resolveTypeWithSubstitution(host, t.tsTypeReference(t.identifier("T")), {
        T: t.tsStringKeyword(),
      }),
    ).toEqual({ type: "string" });
    expect(
      resolveTypeWithSubstitution(host, t.tsArrayType(t.tsTypeReference(t.identifier("T"))), {
        T: t.tsNumberKeyword(),
      }),
    ).toEqual({ type: "array", items: { type: "number" } });

    const intersection = t.tsIntersectionType([
      t.tsTypeReference(t.identifier("T")),
      t.tsTypeLiteral([
        t.tsPropertySignature(t.identifier("ok"), t.tsTypeAnnotation(t.tsBooleanKeyword())),
      ]),
    ]);
    expect(
      resolveTypeWithSubstitution(host, intersection, {
        T: t.tsTypeReference(t.identifier("User")),
      }),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        id: { type: "string" },
        ok: expect.objectContaining({ type: "boolean" }),
      }),
    });
    expect(
      resolveTypeWithSubstitution(host, intersection, {
        T: t.tsTypeReference(t.identifier("Missing")),
      }),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        ok: expect.objectContaining({ type: "boolean" }),
      }),
    });
    expect(
      resolveTypeWithSubstitution(host, intersection, {
        T: t.tsStringKeyword(),
      }),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        ok: expect.objectContaining({ type: "boolean" }),
      }),
    });
    expect(
      resolveTypeWithSubstitution(host, t.tsIntersectionType([t.tsTypeLiteral([])]), {}),
    ).toEqual({ type: "object", properties: {} });

    expect(resolveGenericTypeFromString(host, "NotAGeneric")).toEqual({});
    expect(
      resolveGenericTypeFromString(
        createHost({
          typeDefinitions: { Box: alias },
          resolveGenericType: () => ({ type: "object", properties: { value: { type: "string" } } }),
        }),
        "Box<string>",
      ),
    ).toMatchObject({ type: "object" });
  });
});
