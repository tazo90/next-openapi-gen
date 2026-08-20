import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { convertZodNode, type ZodNodeHost } from "@workspace/openapi-core/schema/zod/zod-node.js";

function host(overrides: Partial<ZodNodeHost> = {}): ZodNodeHost {
  return {
    convertZodSchemaToOpenApi: () => ({ type: "object" }),
    currentAST: t.file(t.program([])),
    currentContentType: "response",
    currentFilePath: "/tmp/schema.ts",
    currentImports: {},
    currentSchemaUsedRuntimeExport: false,
    drizzleZodImports: new Set(),
    expandFactoryCall: () => null,
    findFactoryFunction: () => null,
    getCurrentZodLocalName: () => "z",
    getSchemaReferenceName: (name) => name,
    getStoredSchema: () => undefined,
    isZodLocalName: (name) => name === "z",
    parseFileWithCache: () => t.file(t.program([])),
    applyZodChainMethod: (schema) => schema,
    processZodChain: () => ({ type: "object" }),
    processZodDiscriminatedUnion: () => ({ type: "object" }),
    processZodFunctionalWrapper: () => ({ type: "object" }),
    processZodIntersection: () => ({ type: "object" }),
    processZodLazy: () => ({ type: "object" }),
    processZodLiteral: () => ({ type: "string" }),
    processZodObject: () => ({ type: "object" }),
    processZodPrimitive: () => ({ type: "string" }),
    processZodTuple: () => ({ type: "array" }),
    processZodUnion: () => ({ type: "object" }),
    resolveImportPath: () => null,
    runtimeExporter: { exportSchema: () => null },
    shouldUseRuntimeExport: () => false,
    warnIfUnknownZodHelper: () => undefined,
    ...overrides,
  };
}

function zCall(method: string, args: t.CallExpression["arguments"] = []): t.CallExpression {
  return t.callExpression(t.memberExpression(t.identifier("z"), t.identifier(method)), args);
}

describe("convertZodNode leftover branches", () => {
  it("returns object fallbacks for functional wrappers with argument placeholders", () => {
    const placeholder = t.argumentPlaceholder();
    expect(convertZodNode(host(), zCall("optional", [placeholder]))).toEqual({ type: "object" });
    expect(convertZodNode(host(), zCall("nullable", [placeholder]))).toEqual({ type: "object" });
    expect(convertZodNode(host(), zCall("nullish", [placeholder]))).toEqual({ type: "object" });
  });

  it("applies schema-reference wrappers when the stored schema is missing or present", () => {
    const optionalUser = t.callExpression(
      t.memberExpression(t.identifier("UserSchema"), t.identifier("optional")),
      [],
    );
    expect(convertZodNode(host(), optionalUser)).toMatchObject({ type: "object" });
    expect(
      convertZodNode(
        host({
          getStoredSchema: (name) => (name === "UserSchema" ? { type: "string" } : undefined),
        }),
        optionalUser,
      ),
    ).toMatchObject({
      allOf: [{ $ref: "#/components/schemas/UserSchema" }],
    });
  });

  it("skips factory expansion when the factory cannot be found or expanded", () => {
    const factoryCall = t.callExpression(t.identifier("makeUser"), []);
    expect(convertZodNode(host(), factoryCall)).toMatchObject({ type: "object" });
    expect(
      convertZodNode(
        host({
          findFactoryFunction: () =>
            t.functionDeclaration(t.identifier("makeUser"), [], t.blockStatement([])),
          expandFactoryCall: () => null,
        }),
        factoryCall,
      ),
    ).toMatchObject({ type: "object" });
  });
});
