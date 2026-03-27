import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  escapeRegExp,
  extractDescriptionFromArguments,
  hasOptionalMethod,
  isOptionalCall,
  processZodDiscriminatedUnion,
  processZodIntersection,
  processZodLiteral,
  processZodPrimitiveNode,
  processZodTuple,
  processZodUnion,
} from "@next-openapi-gen/schema/zod/node-helpers.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

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
    expect(processZodLiteral(getFirstInitializer("z.literal('x')") as t.CallExpression)).toEqual({
      type: "string",
      enum: ["x"],
    });
    expect(processZodLiteral(getFirstInitializer("z.literal(2)") as t.CallExpression)).toEqual({
      type: "number",
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
      items: { type: "string" },
    });
  });

  it("extracts descriptions and detects optional chains", () => {
    expect(
      extractDescriptionFromArguments(
        getFirstInitializer('z.string().describe("Documented")') as t.CallExpression,
      ),
    ).toBe("Documented");
    expect(escapeRegExp("a+b")).toBe("a\\+b");
    expect(isOptionalCall(getFirstInitializer("z.string().optional()") as t.CallExpression)).toBe(
      true,
    );
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
  });

  it("processes primitive zod nodes through the extracted helper", () => {
    const ensuredSchemas: string[] = [];
    const context = {
      processNode,
      processObject: () => ({ type: "object" as const }),
      ensureSchema: (schemaName: string) => {
        ensuredSchemas.push(schemaName);
      },
    };

    expect(
      processZodPrimitiveNode(getFirstInitializer("z.bigint()") as t.CallExpression, context),
    ).toEqual({
      type: "integer",
      format: "int64",
    });
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
      format: "binary",
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
    expect(ensuredSchemas).toEqual(["UserSchema"]);
  });
});
