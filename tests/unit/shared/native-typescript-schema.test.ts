import { describe, expect, it } from "vitest";

import {
  getNativeTypeArguments,
  isNativeArrayType,
  isNativeNode,
  isNativeNumberLiteralType,
  isNativeStringLiteralType,
  isNativeTupleType,
  isNativeUnionType,
  resolveNodeHandle,
  typeToOpenApiSchema,
  type NativeSchemaHost,
} from "@workspace/openapi-core/shared/native-typescript-schema.js";
import type {
  NativeCheckerApi,
  NativeNode,
  NativeProjectApi,
  NativeSymbol,
  NativeType,
} from "@workspace/openapi-core/shared/native-typescript-types.js";

const typeFlags = {
  StringLike: 1,
  NumberLike: 2,
  BooleanLike: 4,
  BooleanLiteral: 8,
  TemplateLiteral: 16,
  Null: 32,
  Undefined: 64,
  Any: 128,
  Never: 256,
  Unknown: 512,
  Void: 1024,
  StringLiteral: 2048,
  NumberLiteral: 4096,
  Union: 8192,
} as const;

const host: NativeSchemaHost = {
  objectFlags: { Tuple: 1 },
  symbolFlags: { Optional: 1 },
  typeFlags,
};

function createType(overrides: Partial<NativeType> & { flags: number }): NativeType {
  return overrides;
}

function createNode(text = "prop"): NativeNode {
  return {
    kind: 1,
    pos: 0,
    forEachChild() {
      return undefined;
    },
    getSourceFile() {
      return { fileName: "/virtual.ts" };
    },
    text,
  };
}

function createChecker(overrides: Partial<NativeCheckerApi> = {}): NativeCheckerApi {
  return {
    getPropertiesOfType: () => [],
    getIndexInfosOfType: () => [],
    getDeclaredTypeOfSymbol: () => undefined,
    getReturnTypeOfSignature: () => undefined,
    getShorthandAssignmentValueSymbol: () => undefined,
    getSignaturesOfType: () => [],
    getSymbolAtLocation: () => undefined,
    getTypeArguments: () => [],
    getTypeAtLocation: () => undefined,
    getTypeOfSymbol: () => undefined,
    getTypeOfSymbolAtLocation: () => undefined,
    isArrayLikeType: () => false,
    resolveName: () => undefined,
    typeToString: (type) => String(type.value ?? type.flags),
    ...overrides,
  };
}

function createProject(checker: NativeCheckerApi): NativeProjectApi {
  return {
    checker,
    compilerOptions: {},
    configFileName: "/tsconfig.json",
    program: {
      getSourceFile: () => undefined,
    },
  };
}

describe("native TypeScript schema mapping", () => {
  it("maps primitives, literals, and Date", () => {
    const checker = createChecker({
      typeToString: (type) => (type.getSymbol?.()?.name === "Date" ? "Date" : "string"),
    });
    const project = createProject(checker);

    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.StringLike }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string" });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.NumberLike }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "number" });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.BooleanLike }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "boolean" });
    expect(
      typeToOpenApiSchema(createType({ flags: typeFlags.Null }), checker, project, new Set(), host),
    ).toEqual({ type: "null" });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.TemplateLiteral }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string" });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.StringLiteral, value: "active" }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string", enum: ["active"] });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.NumberLiteral, value: 3 }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "number", enum: [3] });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.BooleanLiteral }),
        createChecker({ typeToString: () => "true" }),
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "boolean", enum: [true] });
    expect(
      typeToOpenApiSchema(
        createType({ flags: 0, getSymbol: () => ({ flags: 0, name: "Date" }) }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string", format: "date-time" });
  });

  it("maps unions, arrays, tuples, objects, and index signatures", () => {
    const stringType = createType({ flags: typeFlags.StringLike });
    const nullType = createType({ flags: typeFlags.Null });
    const literalA = createType({ flags: typeFlags.StringLiteral, value: "a" });
    const literalB = createType({ flags: typeFlags.StringLiteral, value: "b" });
    const numberLiteral = createType({ flags: typeFlags.NumberLiteral, value: 1 });
    const propertyType = createType({ flags: typeFlags.NumberLike });
    const declaration = createNode("id");
    const requiredProperty: NativeSymbol = {
      flags: 0,
      name: "id",
      valueDeclaration: declaration,
    };
    const optionalProperty: NativeSymbol = {
      flags: 1,
      name: "label",
      valueDeclaration: declaration,
    };
    const missingProperty: NativeSymbol = {
      flags: 0,
      name: "ghost",
    };

    const checker = createChecker({
      getTypeArguments: (type) => type.getTypes?.() ?? [],
      isArrayType: (type) => type.getSymbol?.()?.name === "Array",
      isTupleType: (type) => Boolean(type.objectFlags && type.objectFlags & 1),
      getPropertiesOfType: (type) =>
        type.getSymbol?.()?.name === "User"
          ? [requiredProperty, optionalProperty, missingProperty]
          : [],
      getTypeOfSymbol: (symbol) => (symbol.name === "ghost" ? undefined : propertyType),
      getIndexInfosOfType: (type) => {
        if (type.getSymbol?.()?.name === "NumberIndex") {
          return [{ keyType: createType({ flags: typeFlags.NumberLike }), valueType: stringType }];
        }
        if (type.getSymbol?.()?.name === "StringIndex") {
          return [{ keyType: createType({ flags: typeFlags.StringLike }), valueType: stringType }];
        }
        return [];
      },
      typeToString: (type) => {
        if (type.flags & typeFlags.NumberLike) {
          return "number";
        }
        if (type.flags & typeFlags.StringLike) {
          return "string";
        }
        return type.getSymbol?.()?.name ?? "object";
      },
    });
    const project = createProject(checker);

    expect(
      typeToOpenApiSchema(
        createType({
          flags: typeFlags.Union,
          getTypes: () => [literalA, literalB],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string", enum: ["a", "b"] });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: typeFlags.Union,
          getTypes: () => [numberLiteral, nullType],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "number", enum: [1], nullable: true });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: typeFlags.Union,
          getTypes: () => [stringType, nullType],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "string", nullable: true });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: typeFlags.Union,
          getTypes: () => [stringType, createType({ flags: typeFlags.NumberLike })],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: 0,
          getSymbol: () => ({ flags: 0, name: "Array" }),
          getTypes: () => [stringType],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "array", items: { type: "string" } });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: 0,
          objectFlags: 1,
          getTypes: () => [stringType, createType({ flags: typeFlags.NumberLike })],
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: 0,
          getSymbol: () => ({ flags: 0, name: "User" }),
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "number" },
        label: { type: "number" },
      },
      required: ["id"],
    });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: 0,
          getSymbol: () => ({ flags: 0, name: "NumberIndex" }),
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "array", items: { type: "string" } });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: 0,
          getSymbol: () => ({ flags: 0, name: "StringIndex" }),
        }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "object", additionalProperties: { type: "string" } });
  });

  it("collapses recursive types and uses the apparent type when present", () => {
    const apparent = createType({
      flags: 0,
      getSymbol: () => ({ flags: 0, name: "Apparent" }),
    });
    const declaration = createNode("value");
    const checker = createChecker({
      getApparentType: (type) => (type.getSymbol?.()?.name === "Wrapped" ? apparent : type),
      getPropertiesOfType: (type) =>
        type.getSymbol?.()?.name === "Apparent"
          ? [{ flags: 0, name: "value", valueDeclaration: declaration }]
          : [],
      getTypeOfSymbol: () => createType({ flags: typeFlags.StringLike }),
      typeToString: (type) => type.getSymbol?.()?.name ?? "object",
    });
    const project = createProject(checker);

    expect(
      typeToOpenApiSchema(
        createType({ flags: 0, getSymbol: () => ({ flags: 0, name: "Wrapped" }) }),
        checker,
        project,
        new Set(),
        host,
      ),
    ).toEqual({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    });
    expect(
      typeToOpenApiSchema(
        createType({ flags: 0, getSymbol: () => ({ flags: 0, name: "Recursive" }) }),
        checker,
        project,
        new Set(["Recursive"]),
        host,
      ),
    ).toEqual({ type: "object" });
  });

  it("covers node-handle and type-flag helpers", () => {
    const node = createNode();
    const project = createProject(createChecker());
    expect(isNativeNode(node)).toBe(true);
    expect(resolveNodeHandle(undefined, project)).toBeUndefined();
    expect(resolveNodeHandle(node, project)).toBe(node);
    expect(
      resolveNodeHandle(
        {
          resolve: () => node,
        },
        project,
      ),
    ).toBe(node);

    const stringLiteral = createType({ flags: typeFlags.StringLiteral, value: "x" });
    const numberLiteral = createType({ flags: typeFlags.NumberLiteral, value: 1 });
    expect(isNativeStringLiteralType(stringLiteral, typeFlags)).toBe(true);
    expect(isNativeNumberLiteralType(numberLiteral, typeFlags)).toBe(true);
    expect(isNativeUnionType(createType({ flags: typeFlags.Union }), typeFlags)).toBe(true);

    const throwingChecker = createChecker({
      getTypeArguments: () => {
        throw new Error("no args");
      },
      isArrayLikeType: () => true,
      typeToString: () => "string[]",
    });
    expect(getNativeTypeArguments(stringLiteral, throwingChecker)).toEqual([]);
    expect(isNativeArrayType(stringLiteral, throwingChecker, host.objectFlags)).toBe(true);
    expect(
      isNativeTupleType(
        createType({ flags: 0, objectFlags: 1 }),
        createChecker({ typeToString: () => "User" }),
        host.objectFlags,
      ),
    ).toBe(true);
    expect(
      isNativeTupleType(
        createType({ flags: 0 }),
        createChecker({ typeToString: () => "[string]" }),
        {
          Tuple: 0,
        },
      ),
    ).toBe(true);
  });

  it("covers empty flag tables and missing optional checker APIs", () => {
    const emptyHost: NativeSchemaHost = {
      objectFlags: {},
      symbolFlags: {},
      typeFlags: {},
    };
    const checker = createChecker({
      getApparentType: undefined,
      getTypeArguments: () => {
        throw new Error("no args");
      },
      isArrayLikeType: () => false,
      typeToString: () => "object",
    });
    const project = createProject(checker);

    expect(isNativeStringLiteralType(createType({ flags: 1 }), {})).toBe(false);
    expect(isNativeNumberLiteralType(createType({ flags: 1 }), {})).toBe(false);
    expect(isNativeUnionType(createType({ flags: 1 }), {})).toBe(false);
    expect(
      isNativeStringLiteralType(createType({ flags: 0, isStringLiteralType: () => true }), {}),
    ).toBe(true);
    expect(
      isNativeNumberLiteralType(createType({ flags: 0, isNumberLiteralType: () => true }), {}),
    ).toBe(true);
    expect(
      isNativeTupleType(createType({ flags: 0 }), createChecker({ isTupleType: () => true }), {}),
    ).toBe(true);
    expect(
      isNativeTupleType(createType({ flags: 0 }), createChecker({ isTupleType: () => false }), {}),
    ).toBe(false);
    expect(
      isNativeArrayType(
        createType({ flags: 0 }),
        createChecker({
          isArrayLikeType: () => true,
          isTupleType: () => false,
          typeToString: () => "X",
        }),
        {},
      ),
    ).toBe(true);
    expect(
      typeToOpenApiSchema(createType({ flags: 0 }), checker, project, new Set(), emptyHost),
    ).toEqual({ type: "object" });
    expect(
      typeToOpenApiSchema(createType({ flags: 8192 }), checker, project, new Set(), {
        ...emptyHost,
        typeFlags: { Union: 8192 },
      }),
    ).toEqual({ oneOf: [] });
    expect(
      typeToOpenApiSchema(
        createType({ flags: typeFlags.BooleanLiteral }),
        createChecker({ typeToString: () => "false" }),
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "boolean", enum: [false] });
    expect(
      typeToOpenApiSchema(
        createType({ flags: 0, getSymbol: () => ({ flags: 0, name: "Array" }) }),
        createChecker({
          isArrayType: () => true,
          getTypeArguments: () => [],
          getPropertiesOfType: () => [],
          getIndexInfosOfType: () => [],
          typeToString: () => "Array",
        }),
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "array", items: { type: "object" } });

    const declaration = createNode("id");
    const property: NativeSymbol = {
      flags: 0,
      name: "id",
      declarations: [declaration],
    };
    const objectChecker = createChecker({
      getPropertiesOfType: () => [property],
      getTypeOfSymbol: () => undefined,
      getTypeOfSymbolAtLocation: () => createType({ flags: typeFlags.StringLike }),
      typeToString: () => "User",
    });
    expect(
      typeToOpenApiSchema(
        createType({ flags: 0, getSymbol: () => ({ flags: 0, name: "User" }) }),
        objectChecker,
        createProject(objectChecker),
        new Set(),
        emptyHost,
      ),
    ).toEqual({
      type: "object",
      properties: { id: { type: "object" } },
      required: ["id"],
    });

    const trueLiteral = createType({ flags: typeFlags.BooleanLiteral });
    const falseLiteral = createType({ flags: typeFlags.BooleanLiteral });
    expect(
      typeToOpenApiSchema(
        createType({
          flags: typeFlags.Union,
          getTypes: () => [trueLiteral, falseLiteral],
        }),
        createChecker({
          typeToString: (type) => (type === trueLiteral ? "true" : "false"),
        }),
        project,
        new Set(),
        host,
      ),
    ).toEqual({ type: "boolean", enum: [true, false] });

    expect(resolveNodeHandle(undefined, project)).toBeUndefined();
    expect(
      resolveNodeHandle(
        {
          resolve: () => createNode("resolved"),
        },
        project,
      )?.text,
    ).toBe("resolved");
    expect(
      getNativeTypeArguments(createType({ flags: 0 }), {
        ...createChecker(),
        getTypeArguments: () => {
          throw new Error("no args");
        },
      }),
    ).toEqual([]);
    expect(
      isNativeTupleType(
        createType({ flags: 0 }),
        createChecker({
          isTupleType: undefined,
          typeToString: () => "[string, number]",
        }),
        host.objectFlags,
      ),
    ).toBe(true);
    expect(
      isNativeArrayType(
        createType({ flags: 0 }),
        createChecker({
          isArrayType: undefined,
          isArrayLikeType: () => true,
          isTupleType: () => false,
          typeToString: () => "string[]",
        }),
        host.objectFlags,
      ),
    ).toBe(true);
    expect(
      isNativeStringLiteralType(createType({ flags: typeFlags.StringLiteral }), typeFlags),
    ).toBe(true);
    expect(
      isNativeNumberLiteralType(createType({ flags: typeFlags.NumberLiteral }), typeFlags),
    ).toBe(true);

    const apparent = createType({ flags: 0 });
    const apparentChecker = createChecker({
      getApparentType: () => apparent,
      getPropertiesOfType: (type) =>
        type === apparent
          ? [
              {
                flags: 0,
                name: "id",
                valueDeclaration: createNode("id"),
              },
            ]
          : [],
      getTypeOfSymbolAtLocation: () => createType({ flags: typeFlags.StringLike }),
      typeToString: () => "Apparent",
    });
    expect(
      typeToOpenApiSchema(
        createType({ flags: 0 }),
        apparentChecker,
        createProject(apparentChecker),
        new Set(),
        host,
      ),
    ).toMatchObject({ type: "object" });
  });
});
