import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  escapeRegExp,
  extractDescriptionFromArguments,
  hasOptionalMethod,
  isNullBranchNode,
  isOptionalCall,
  isOptionalUnionCall,
  isUndefinedBranchNode,
  processZodDiscriminatedUnion,
  processZodIntersection,
  processZodLiteral,
  processZodPrimitiveNode,
  processZodTuple,
  processZodUnion,
} from "@workspace/openapi-core/schema/zod/node-helpers.js";
import type { OpenApiSchema } from "@workspace/openapi-core/shared/types.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

function getFirstInitializer(source: string): t.Expression {
  const ast = parseTypeScriptFile(`const schema = ${source};`);
  const statement = ast.program.body[0];
  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error("Expected variable declaration");
  }

  const initializer = statement.declarations[0]?.init;
  if (!initializer) {
    throw new Error("Expected initializer");
  }

  return initializer;
}

describe("Zod node helpers", () => {
  const processNode = (node: t.Expression | t.SpreadElement) => {
    if (t.isSpreadElement(node)) {
      return { type: "object" };
    }

    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
      if (
        t.isIdentifier(node.callee.object, { name: "z" }) &&
        t.isIdentifier(node.callee.property)
      ) {
        switch (node.callee.property.name) {
          case "literal":
            return processZodLiteral(node);
          case "string":
            return { type: "string" };
          case "number":
            return { type: "number" };
          case "null":
            return { type: "null" };
        }
      }
    }

    return { type: "object" };
  };

  it("handles literal, tuple, intersection, and union helpers", () => {
    expect(processZodLiteral(getFirstInitializer("z.literal()") as t.CallExpression)).toEqual({
      type: "string",
    });
    expect(processZodLiteral(getFirstInitializer("z.literal('x')") as t.CallExpression)).toEqual({
      type: "string",
      enum: ["x"],
    });
    expect(processZodLiteral(getFirstInitializer("z.literal(2)") as t.CallExpression)).toEqual({
      type: "integer",
      enum: [2],
    });
    expect(processZodLiteral(getFirstInitializer("z.literal(true)") as t.CallExpression)).toEqual({
      type: "boolean",
      enum: [true],
    });
    expect(
      processZodTuple(getFirstInitializer("z.tuple()") as t.CallExpression, processNode),
    ).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(
      processZodIntersection(
        getFirstInitializer("z.intersection(z.string(), z.number())") as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      allOf: [{ type: "string" }, { type: "number" }],
    });
    expect(
      processZodIntersection(
        getFirstInitializer("z.intersection(z.string())") as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      type: "object",
    });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.string(), z.null()])") as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      type: "string",
      nullable: true,
    });
    expect(
      processZodUnion(getFirstInitializer("z.union(z.string())") as t.CallExpression, processNode),
    ).toEqual({
      type: "object",
    });
  });

  it("handles discriminated union fallbacks and enum-style unions", () => {
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion()") as t.CallExpression,
        processNode,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", [])') as t.CallExpression,
        processNode,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", z.string())') as t.CallExpression,
        processNode,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", [z.string()])') as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      type: "object",
      discriminator: {
        propertyName: "kind",
      },
      oneOf: [{ type: "string" }],
    });

    // Build a discriminator.mapping from variants that are `$ref`s with a literal
    // discriminator value in their properties — this lets clients route responses
    // without inspecting every variant inline.
    const refA: OpenApiSchema = {
      $ref: "#/components/schemas/Circle",
      properties: { kind: { type: "string", enum: ["circle"] } },
    } as OpenApiSchema;
    const refB: OpenApiSchema = {
      $ref: "#/components/schemas/Square",
      properties: { kind: { type: "string", enum: ["square"] } },
    } as OpenApiSchema;
    let callIdx = 0;
    const variants = [refA, refB];
    const processVariants = (): OpenApiSchema => {
      const schema = variants[callIdx] ?? { type: "object" };
      callIdx += 1;
      return schema;
    };
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", [Circle, Square])') as t.CallExpression,
        processVariants,
      ),
    ).toEqual({
      type: "object",
      discriminator: {
        propertyName: "kind",
        mapping: {
          circle: "#/components/schemas/Circle",
          square: "#/components/schemas/Square",
        },
      },
      oneOf: [refA, refB],
    });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.literal('a'), z.literal('b')])") as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    expect(
      processZodTuple(
        getFirstInitializer("z.tuple([z.string(), z.number()])") as t.CallExpression,
        processNode,
      ),
    ).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
  });

  it("extracts descriptions and detects optional chains", () => {
    expect(
      extractDescriptionFromArguments(
        getFirstInitializer('z.string().describe("Documented")') as t.CallExpression,
      ),
    ).toBe("Documented");
    expect(escapeRegExp("a+b")).toBe("a\\+b");
    expect(isOptionalCall(getFirstInitializer("z.optional(z.string())") as t.CallExpression)).toBe(
      true,
    );
    expect(isOptionalCall(getFirstInitializer("z.string().optional()") as t.CallExpression)).toBe(
      true,
    );
    expect(
      hasOptionalMethod(getFirstInitializer("z.nullish(z.string())") as t.CallExpression),
    ).toBe(true);
    expect(
      hasOptionalMethod(getFirstInitializer("z.nullable(z.string())") as t.CallExpression),
    ).toBe(false);
    expect(
      hasOptionalMethod(
        getFirstInitializer("z.string().nullable().optional()") as t.CallExpression,
      ),
    ).toBe(true);
    expect(
      extractDescriptionFromArguments(getFirstInitializer("z.string().min(1)") as t.CallExpression),
    ).toBeNull();
    expect(
      hasOptionalMethod(getFirstInitializer("z.string().nullable()") as t.CallExpression),
    ).toBe(false);
    expect(isOptionalCall(getFirstInitializer("z.string().nullable()") as t.CallExpression)).toBe(
      false,
    );
    expect(
      isOptionalUnionCall(
        getFirstInitializer("z.union([z.string(), z.undefined()])") as t.CallExpression,
      ),
    ).toBe(true);
    expect(isUndefinedBranchNode(getFirstInitializer("z.undefined()"))).toBe(true);
  });

  it("processes primitive zod nodes through the extracted helper", () => {
    const ensuredSchemas: string[] = [];
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: (schemaName: string) => {
        ensuredSchemas.push(schemaName);
      },
      getReferenceSchema: (schemaName: string) => ({
        $ref: `#/components/schemas/${schemaName}`,
      }),
    };

    expect(
      processZodPrimitiveNode(getFirstInitializer("z.bigint()") as t.CallExpression, context),
    ).toEqual({
      type: "integer",
      format: "int64",
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.any()") as t.CallExpression, context),
    ).toEqual({});
    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.array(UserSchema)") as t.CallExpression,
        context,
      ),
    ).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/UserSchema" },
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.custom<File>()") as t.CallExpression, context),
    ).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.enum({})") as t.CallExpression, context),
    ).toEqual({
      type: "string",
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.record()") as t.CallExpression, context),
    ).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.object()") as t.CallExpression, context),
    ).toEqual({
      type: "object",
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.custom<User>()") as t.CallExpression, context),
    ).toEqual({
      type: "string",
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.custom()") as t.CallExpression, context),
    ).toEqual({
      type: "string",
    });
    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.custom(() => true)") as t.CallExpression,
        context,
      ),
    ).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.never()") as t.CallExpression, context),
    ).toEqual({
      not: {},
    });
    expect(ensuredSchemas).toEqual(["UserSchema"]);
  });

  it("resolves z.enum with identifier via resolveEnumValues callback", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
      resolveEnumValues: (name: string) => {
        if (name === "Color") return ["red", "green", "blue"];
        if (name === "STATUS") return ["active", "inactive", "pending"];
        return null;
      },
    };

    // TS enum identifier
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.enum(Color)") as t.CallExpression, context),
    ).toEqual({ type: "string", enum: ["red", "green", "blue"] });

    // as const object identifier
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.enum(STATUS)") as t.CallExpression, context),
    ).toEqual({ type: "string", enum: ["active", "inactive", "pending"] });

    // z.nativeEnum also works
    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.nativeEnum(Color)") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string", enum: ["red", "green", "blue"] });
  });

  it("falls back to { type: 'string' } for unresolvable enum identifiers", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
      resolveEnumValues: () => null,
    };

    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.enum(UnknownEnum)") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string" });
  });

  it("covers remaining primitive helpers including template literals", () => {
    const context = {
      processNode: (node: t.Expression | t.SpreadElement) => {
        if (t.isSpreadElement(node)) {
          return { type: "object" as const };
        }
        if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
          const name = t.isIdentifier(node.callee.property) ? node.callee.property.name : "";
          if (name === "literal") {
            return processZodLiteral(node);
          }
          if (name === "int") {
            return { type: "integer" as const };
          }
          if (name === "number") {
            return { type: "number" as const };
          }
          if (name === "boolean") {
            return { type: "boolean" as const };
          }
          if (name === "string") {
            return { type: "string" as const };
          }
        }
        return { type: "object" as const };
      },
      processObject: () => ({ type: "object" as const, properties: { id: { type: "string" } } }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
    };

    const cases: Array<[string, OpenApiSchema]> = [
      ["z.string()", { type: "string" }],
      ["z.number()", { type: "number" }],
      ["z.float32()", { type: "number", format: "float" }],
      ["z.float64()", { type: "number", format: "double" }],
      ["z.int()", { type: "integer" }],
      ["z.int32()", { type: "integer", format: "int32" }],
      ["z.int64()", { type: "integer", format: "int64" }],
      ["z.uint32()", { type: "integer", minimum: 0, maximum: 4294967295 }],
      ["z.uint64()", { type: "integer", format: "int64", minimum: 0 }],
      ["z.boolean()", { type: "boolean" }],
      ["z.date()", { type: "string", format: "date-time" }],
      ["z.symbol()", { type: "string" }],
      ["z.null()", { type: "null" }],
      ["z.void()", { type: "null" }],
      ["z.nan()", { type: "number" }],
      ["z.function()", {}],
      ["z.unknown()", {}],
      ["z.array()", { type: "array" }],
      ["z.array(z.string())", { type: "array", items: { type: "string" } }],
      ["z.enum(['a', 'b'])", { type: "string", enum: ["a", "b"] }],
      ["z.enum({ A: 'a', B: 2 })", { type: "string", enum: ["a", 2] }],
      [
        "z.record(z.string(), z.number())",
        {
          type: "object",
          additionalProperties: { type: "number" },
          propertyNames: { type: "string" },
        },
      ],
      ["z.record(z.number())", { type: "object", additionalProperties: { type: "number" } }],
      [
        "z.map(z.string(), z.boolean())",
        {
          type: "object",
          additionalProperties: { type: "boolean" },
          propertyNames: { type: "string" },
        },
      ],
      ["z.map(z.string())", { type: "object", additionalProperties: { type: "string" } }],
      ["z.set(z.number())", { type: "array", items: { type: "number" }, uniqueItems: true }],
      ["z.set()", { type: "array", items: { type: "string" }, uniqueItems: true }],
      [
        "z.strictObject({ id: z.string() })",
        { type: "object", properties: { id: { type: "string" } }, additionalProperties: false },
      ],
      [
        "z.looseObject({ id: z.string() })",
        { type: "object", properties: { id: { type: "string" } }, additionalProperties: true },
      ],
      ["z.instanceof(File)", { type: "string", contentMediaType: "application/octet-stream" }],
      ["z.instanceof(Date)", { type: "string", format: "date-time" }],
      ["z.instanceof(URL)", { type: "string" }],
      ["z.instanceof(Unknown)", {}],
      ["z.instanceof(1)", {}],
      ["z.promise(z.string())", { type: "string" }],
      ["z.promise()", {}],
      ["z.preprocess((v) => v, z.number())", { type: "number" }],
      ["z.pipeline(z.string(), z.number())", { type: "number" }],
      ["z.pipe(z.string(), z.boolean())", { type: "boolean" }],
      ["z.lazy(() => z.string())", { type: "string" }],
      ["z.lazy(() => { return z.string(); })", {}],
      ["z.lazy(1)", {}],
      ["z.string().describe('Documented')", { type: "string", description: "Documented" }],
      ["z.weird()", { type: "string" }],
    ];

    for (const [source, expected] of cases) {
      expect(
        processZodPrimitiveNode(getFirstInitializer(source) as t.CallExpression, context),
      ).toEqual(expected);
    }

    expect(
      processZodPrimitiveNode(
        getFirstInitializer(
          "z.templateLiteral(['user-', z.literal('admin'), '-', z.int(), '-', z.number(), '-', z.boolean(), '-', z.string(), 1, ...parts])",
        ) as t.CallExpression,
        context,
      ),
    ).toEqual({
      type: "string",
      pattern: "^user-(?:admin)--?\\d+--?\\d+(?:\\.\\d+)?-(?:true|false)-.+1$",
    });
    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.templateLiteral()") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string" });
    expect(
      processZodPrimitiveNode(
        getFirstInitializer("z.templateLiteral([])") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string" });
  });

  it("covers leftover literal, union, and discriminated-union branches", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
      resolveLiteralValue(name: string) {
        if (name === "KIND") return "dog";
        if (name === "LABEL") return "admin";
        if (name === "COUNT") return 3;
        if (name === "FLAG") return true;
        if (name === "EMPTY") return null;
        return undefined;
      },
    };

    expect(
      processZodLiteral(getFirstInitializer("z.literal(LABEL)") as t.CallExpression, context),
    ).toEqual({ type: "string", enum: ["admin"] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(COUNT)") as t.CallExpression, context),
    ).toEqual({ type: "integer", enum: [3] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(FLAG)") as t.CallExpression, context),
    ).toEqual({ type: "boolean", enum: [true] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(EMPTY)") as t.CallExpression, context),
    ).toEqual({ type: "null", enum: [null] });
    expect(
      processZodLiteral(
        getFirstInitializer("z.literal('x' as const)") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string", enum: ["x"] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(null)") as t.CallExpression, context),
    ).toEqual({ type: "null", enum: [null] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal([null])") as t.CallExpression, context),
    ).toEqual({ type: "null", enum: [null] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal([1, 2])") as t.CallExpression, context),
    ).toEqual({ type: "integer", enum: [1, 2] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal([1.5, 2])") as t.CallExpression, context),
    ).toEqual({ type: "number", enum: [1.5, 2] });
    expect(
      processZodLiteral(
        getFirstInitializer("z.literal([true, false])") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "boolean", enum: [true, false] });

    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.literal('a'), z.literal('b')])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "string", enum: ["a", "b"] });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer(
          "z.discriminatedUnion(KIND, [z.object({}), z.object({})])",
        ) as t.CallExpression,
        () => ({ type: "object", properties: { kind: { type: "string" } } }),
        context,
      ),
    ).toMatchObject({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion('kind')") as t.CallExpression,
        () => ({ type: "object" }),
        context,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion('kind', VARIANTS as const)") as t.CallExpression,
        () => ({ type: "object" }),
        context,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodTuple(getFirstInitializer("z.tuple(PAIR)") as t.CallExpression, processNode, {
        ...context,
        resolveConstArrayValues(name: string) {
          if (name === "PAIR") return ["a", 1.5];
          return undefined;
        },
      }),
    ).toEqual({
      type: "array",
      prefixItems: [
        { type: "string", enum: ["a"] },
        { type: "number", enum: [1.5] },
      ],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
    expect(
      processZodTuple(getFirstInitializer("z.tuple(EMPTY)") as t.CallExpression, processNode, {
        ...context,
        resolveConstArrayValues() {
          return [];
        },
      }),
    ).toEqual({ type: "array", items: { type: "string" } });

    expect(isNullBranchNode(getFirstInitializer("z.null()"))).toBe(true);
    expect(
      isOptionalUnionCall(
        getFirstInitializer("z.union([z.string(), z.undefined()])") as t.CallExpression,
      ),
    ).toBe(true);
    expect(
      isOptionalUnionCall(getFirstInitializer("z.union(ITEMS as const)") as t.CallExpression),
    ).toBe(false);
    expect(isOptionalUnionCall(getFirstInitializer("z.union()") as t.CallExpression)).toBe(false);
    expect(
      processZodUnion(getFirstInitializer("z.union()") as t.CallExpression, processNode, context),
    ).toEqual({ type: "object" });
    expect(
      processZodUnion(getFirstInitializer("z.union(STATUSES)") as t.CallExpression, processNode, {
        ...context,
        resolveConstArrayValues(name: string) {
          if (name === "STATUSES") return [1, 2];
          if (name === "RATIOS") return [1.5, 2.5];
          return undefined;
        },
      }),
    ).toEqual({ type: "integer", enum: [1, 2] });
    expect(
      processZodUnion(getFirstInitializer("z.union(RATIOS)") as t.CallExpression, processNode, {
        ...context,
        resolveConstArrayValues(name: string) {
          if (name === "RATIOS") return [1.5, 2.5];
          return undefined;
        },
      }),
    ).toEqual({ type: "number", enum: [1.5, 2.5] });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.string(), z.null()])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({ type: "string", nullable: true });
  });

  it("falls back to { type: 'string' } for enum identifier without resolveEnumValues", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
    };

    expect(
      processZodPrimitiveNode(getFirstInitializer("z.enum(SomeEnum)") as t.CallExpression, context),
    ).toEqual({ type: "string" });
  });

  it("covers leftover literal null arrays and as-const wrappers", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
      resolveLiteralValue(name: string) {
        if (name === "NULL_VALUE") return null;
        return undefined;
      },
    };

    expect(
      processZodLiteral(getFirstInitializer("z.literal([null])") as t.CallExpression, context),
    ).toEqual({ type: "null", enum: [null] });
    expect(
      processZodLiteral(
        getFirstInitializer("z.literal([null, null])") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "null", enum: [null, null] });
    expect(
      processZodLiteral(
        getFirstInitializer("z.literal(['a'] as const)") as t.CallExpression,
        context,
      ),
    ).toEqual({ type: "string", enum: ["a"] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(NULL_VALUE)") as t.CallExpression, context),
    ).toEqual({ type: "null", enum: [null] });
  });

  it("covers leftover union, tuple, and discriminated-union identifier branches", () => {
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: () => {},
      getReferenceSchema: () => ({}),
      resolveLiteralValue(name: string) {
        if (name === "KIND") return "kind";
        if (name === "COUNT") return 2;
        if (name === "RATE") return 1.5;
        if (name === "FLAG") return true;
        return undefined;
      },
      resolveConstArrayValues(name: string) {
        if (name === "INTS") return [1, 2];
        if (name === "NUMS") return [1.5, 2.5];
        if (name === "LABELS") return ["a", "b"];
        if (name === "EMPTY") return [];
        return null;
      },
    };

    expect(
      processZodLiteral(getFirstInitializer("z.literal(COUNT)") as t.CallExpression, context),
    ).toEqual({ type: "integer", enum: [2] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(RATE)") as t.CallExpression, context),
    ).toEqual({ type: "number", enum: [1.5] });
    expect(
      processZodLiteral(getFirstInitializer("z.literal(FLAG)") as t.CallExpression, context),
    ).toEqual({ type: "boolean", enum: [true] });

    expect(
      processZodTuple(getFirstInitializer("z.tuple()") as t.CallExpression, processNode),
    ).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(
      processZodTuple(
        getFirstInitializer("z.tuple(INTS)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({
      type: "array",
      prefixItems: expect.arrayContaining([{ type: "integer", enum: [1] }]),
    });
    expect(
      processZodTuple(
        getFirstInitializer("z.tuple(NUMS)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({
      type: "array",
      prefixItems: expect.arrayContaining([{ type: "number", enum: [1.5] }]),
    });
    expect(
      processZodTuple(
        getFirstInitializer("z.tuple(EMPTY)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "array", items: { type: "string" } });
    expect(
      processZodTuple(
        getFirstInitializer("z.tuple([] as const)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "array", prefixItems: [], items: false });

    expect(
      processZodUnion(getFirstInitializer("z.union()") as t.CallExpression, processNode),
    ).toEqual({
      type: "object",
    });
    expect(
      processZodUnion(
        getFirstInitializer("z.union(INTS)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "integer", enum: [1, 2] });
    expect(
      processZodUnion(
        getFirstInitializer("z.union(NUMS)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "number", enum: [1.5, 2.5] });
    expect(
      processZodUnion(
        getFirstInitializer("z.union(EMPTY)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.literal('a'), z.literal('b')])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "string", enum: ["a", "b"] });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.string(), z.null()])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({ type: "string", nullable: true });
    expect(
      processZodUnion(
        getFirstInitializer("z.union([z.string(), z.undefined()])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({ type: "string" });

    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion()") as t.CallExpression,
        processNode,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion(KIND, VARIANTS)") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion(KIND, [])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion(MISSING, [z.object({})])") as t.CallExpression,
        processNode,
        context,
      ),
    ).toMatchObject({ type: "object", oneOf: expect.any(Array) });

    expect(
      processZodIntersection(
        getFirstInitializer("z.intersection(z.object({}))") as t.CallExpression,
        processNode,
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodIntersection(
        getFirstInitializer("z.intersection(FOO, BAR)") as t.CallExpression,
        () => ({ type: "object" }),
      ),
    ).toMatchObject({ allOf: expect.any(Array) });
    expect(
      processZodPrimitiveNode(getFirstInitializer("z.enum([])") as t.CallExpression, context),
    ).toEqual({ type: "string", enum: [] });
    expect(isOptionalUnionCall(getFirstInitializer("z.union()") as t.CallExpression)).toBe(false);
    expect(
      isOptionalUnionCall(
        getFirstInitializer("z.union([z.string(), z.undefined()] as const)") as t.CallExpression,
      ),
    ).toBe(true);
  });
});
