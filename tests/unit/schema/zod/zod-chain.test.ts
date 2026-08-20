import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { applyZodChainMethod } from "@workspace/openapi-core/schema/zod/zod-chain.js";
import type { OpenApiSchema } from "@workspace/openapi-core/shared/types.js";

function host() {
  return {
    applyDeepPartial() {},
    applyFunctionalCheckArg(schema: OpenApiSchema) {
      return schema;
    },
    currentFilePath: "/virtual.ts",
    escapeRegExp(value: string) {
      return value;
    },
    extractMaskKeysFromNode() {
      return ["id"];
    },
    extractStaticJsonValue() {
      return undefined;
    },
    mergeExtendedObject(base: OpenApiSchema) {
      return base;
    },
    mergePipeSchema(schema: OpenApiSchema, piped: OpenApiSchema) {
      return { ...schema, ...piped };
    },
    processZodNode() {
      return { type: "string" as const };
    },
    resolveLiteralValue() {
      return undefined;
    },
    resolveNumericArg() {
      return undefined;
    },
    resolveStringArg() {
      return undefined;
    },
    resolveStringArrayArg() {
      return undefined;
    },
    unwrapTypeAssertion(node: t.Node | undefined) {
      return node ?? t.identifier("x");
    },
    warnIfUnknownZodMethod() {},
  };
}

function call(
  method: string,
  args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined> = [],
) {
  return t.callExpression(
    t.memberExpression(t.identifier("schema"), t.identifier(method)),
    args.filter((arg): arg is t.Expression | t.SpreadElement | t.ArgumentPlaceholder =>
      Boolean(arg),
    ),
  );
}

describe("applyZodChainMethod leftover branches", () => {
  it("covers catchall placeholders, pick required filtering, and empty or/and args", () => {
    const converter = host();
    const objectSchema: OpenApiSchema = {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    };

    expect(
      applyZodChainMethod(
        converter,
        { type: "object", properties: { id: { type: "string" } }, required: ["name"] },
        "pick",
        call("pick"),
      ),
    ).toMatchObject({ required: [] });
    expect(
      applyZodChainMethod(converter, { ...objectSchema }, "passthrough", call("passthrough")),
    ).toMatchObject({ additionalProperties: true });

    const catchallPlaceholder = call("catchall");
    catchallPlaceholder.arguments = [t.argumentPlaceholder()];
    expect(
      applyZodChainMethod(converter, { ...objectSchema }, "catchall", catchallPlaceholder),
    ).toMatchObject({ additionalProperties: true });

    expect(
      applyZodChainMethod(
        converter,
        { ...objectSchema },
        "catchall",
        call("catchall", [t.identifier("z")]),
      ),
    ).toMatchObject({ additionalProperties: { type: "string" } });

    expect(
      applyZodChainMethod(
        converter,
        { ...objectSchema },
        "pick",
        call("pick", [t.identifier("MASK")]),
      ),
    ).toMatchObject({
      properties: { id: { type: "string" } },
      required: ["id"],
    });

    const orHole = call("or", [t.identifier("x")]);
    orHole.arguments = [undefined as never];
    expect(applyZodChainMethod(converter, { type: "string" }, "or", orHole)).toEqual({
      type: "string",
    });

    const andHole = call("and", [t.identifier("x")]);
    andHole.arguments = [undefined as never];
    expect(applyZodChainMethod(converter, { type: "string" }, "and", andHole)).toEqual({
      type: "string",
    });
  });

  it("covers mime, default object keys, and catch fallbacks", () => {
    const converter = {
      ...host(),
      resolveStringArrayArg(argument: t.Node) {
        if (t.isStringLiteral(argument)) {
          return [argument.value];
        }
        if (t.isArrayExpression(argument)) {
          return argument.elements.flatMap((element) =>
            t.isStringLiteral(element) ? [element.value] : [],
          );
        }
        return undefined;
      },
      resolveLiteralValue(name: string) {
        return name === "DEFAULT_STATUS" ? "draft" : undefined;
      },
      extractStaticJsonValue(node: t.Node) {
        if (t.isStringLiteral(node)) {
          return node.value;
        }
        return undefined;
      },
    };

    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "mime",
        call("mime", [t.stringLiteral("image/png")]),
      ),
    ).toMatchObject({ contentMediaType: "image/png" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "mime",
        call("mime", [
          t.arrayExpression([t.stringLiteral("image/png"), t.stringLiteral("image/jpeg")]),
        ]),
      ),
    ).toMatchObject({ "x-contentMediaTypes": ["image/png", "image/jpeg"] });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "mime",
        call("mime", [t.identifier("rest")]),
      ),
    ).toEqual({ type: "string" });

    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "default",
        call("default", [t.identifier("DEFAULT_STATUS")]),
      ),
    ).toMatchObject({ default: "draft" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "object" },
        "default",
        call("default", [
          t.objectExpression([
            t.objectProperty(t.stringLiteral("ok"), t.booleanLiteral(true)),
            t.objectProperty(t.identifier("count"), t.numericLiteral(1)),
            t.objectProperty(t.identifier("label"), t.stringLiteral("x")),
            t.objectProperty(t.identifier("skip"), t.nullLiteral()),
          ]),
        ]),
      ),
    ).toMatchObject({ default: { ok: true, count: 1, label: "x" } });
    expect(applyZodChainMethod(converter, { type: "string" }, "default", call("default"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "catch",
        call("catch", [t.stringLiteral("fallback")]),
      ),
    ).toMatchObject({ default: "fallback" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string", default: "kept" },
        "prefault",
        call("prefault", [t.stringLiteral("ignored")]),
      ),
    ).toMatchObject({ default: "kept" });
  });

  it("covers describe, bounds, formats, and object-mode leftovers", () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    const converter = {
      ...host(),
      diagnostics: {
        add(diagnostic: Record<string, unknown>) {
          diagnostics.push(diagnostic);
        },
      },
      resolveNumericArg: () => 2,
      resolveStringArg: () => "hello",
      extractStaticJsonValue: () => ({
        title: "User",
        description: "A user",
        examples: ["a"],
        deprecated: true,
        extra: true,
      }),
    };

    expect(
      applyZodChainMethod(converter, { type: "string" }, "describe", call("describe")),
    ).toMatchObject({ description: "hello" });
    expect(
      applyZodChainMethod(
        { ...converter, resolveStringArg: () => "@deprecated old" },
        { type: "string" },
        "describe",
        call("describe"),
      ),
    ).toMatchObject({ deprecated: true, description: "old" });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "deprecated", call("deprecated")),
    ).toMatchObject({
      deprecated: true,
    });

    expect(applyZodChainMethod(converter, { type: "string" }, "min", call("min"))).toMatchObject({
      minLength: 2,
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "min", call("min"))).toMatchObject({
      minimum: 2,
    });
    expect(applyZodChainMethod(converter, { type: "integer" }, "min", call("min"))).toMatchObject({
      minimum: 2,
    });
    expect(applyZodChainMethod(converter, { type: "array" }, "min", call("min"))).toMatchObject({
      minItems: 2,
    });
    expect(applyZodChainMethod(converter, { type: "object" }, "min", call("min"))).toEqual({
      type: "object",
    });

    expect(applyZodChainMethod(converter, { type: "string" }, "max", call("max"))).toMatchObject({
      maxLength: 2,
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "max", call("max"))).toMatchObject({
      maximum: 2,
    });
    expect(applyZodChainMethod(converter, { type: "integer" }, "max", call("max"))).toMatchObject({
      maximum: 2,
    });
    expect(applyZodChainMethod(converter, { type: "array" }, "max", call("max"))).toMatchObject({
      maxItems: 2,
    });

    expect(
      applyZodChainMethod(converter, { type: "string" }, "length", call("length")),
    ).toMatchObject({
      minLength: 2,
      maxLength: 2,
    });
    expect(
      applyZodChainMethod(converter, { type: "array" }, "length", call("length")),
    ).toMatchObject({
      minItems: 2,
      maxItems: 2,
    });
    expect(applyZodChainMethod(converter, { type: "object" }, "length", call("length"))).toEqual({
      type: "object",
    });

    expect(
      applyZodChainMethod(converter, { type: "array" }, "nonempty", call("nonempty")),
    ).toMatchObject({
      minItems: 1,
    });
    expect(
      applyZodChainMethod(converter, { type: "array", minItems: 3 }, "nonempty", call("nonempty")),
    ).toMatchObject({ minItems: 3 });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "nonempty", call("nonempty")),
    ).toMatchObject({
      minLength: 1,
    });
    expect(
      applyZodChainMethod(converter, { type: "object" }, "nonempty", call("nonempty")),
    ).toEqual({
      type: "object",
    });

    expect(
      applyZodChainMethod(
        converter,
        { type: "array", prefixItems: [{ type: "string" }], maxItems: 1 },
        "rest",
        call("rest", [t.identifier("z")]),
      ),
    ).toMatchObject({ items: { type: "string" } });
    expect(applyZodChainMethod(converter, { type: "array" }, "rest", call("rest"))).toEqual({
      type: "array",
    });

    expect(
      applyZodChainMethod(converter, { type: "string" }, "email", call("email")),
    ).toMatchObject({
      format: "email",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "xid", call("xid"))).toBeDefined();
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "regex",
        call("regex", [t.regExpLiteral("abc", "")]),
      ),
    ).toMatchObject({ pattern: "abc" });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "startsWith", call("startsWith")),
    ).toMatchObject({
      pattern: "^hello",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "endsWith", call("endsWith")),
    ).toMatchObject({
      pattern: "hello$",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "includes", call("includes")),
    ).toMatchObject({
      pattern: "hello",
    });
    expect(
      applyZodChainMethod(converter, { type: "number" }, "multipleOf", call("multipleOf")),
    ).toMatchObject({
      multipleOf: 2,
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "int", call("int"))).toMatchObject({
      type: "integer",
    });
    expect(
      applyZodChainMethod(converter, { type: "number" }, "positive", call("positive")),
    ).toMatchObject({
      exclusiveMinimum: 0,
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "safe", call("safe"))).toMatchObject({
      minimum: -9007199254740991,
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "minSize", call("minSize")),
    ).toMatchObject({
      minLength: 2,
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "maxSize", call("maxSize")),
    ).toMatchObject({
      maxLength: 2,
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "readonly", call("readonly")),
    ).toMatchObject({
      readOnly: true,
    });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "default",
        call("default", [t.stringLiteral("x")]),
      ),
    ).toMatchObject({ default: "x" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "number" },
        "default",
        call("default", [t.numericLiteral(1)]),
      ),
    ).toMatchObject({ default: 1 });
    expect(
      applyZodChainMethod(
        converter,
        { type: "boolean" },
        "default",
        call("default", [t.booleanLiteral(false)]),
      ),
    ).toMatchObject({ default: false });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "default",
        call("default", [t.nullLiteral()]),
      ),
    ).toMatchObject({ default: null });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "meta", call("meta", [t.identifier("m")])),
    ).toMatchObject({
      title: "User",
      description: "A user",
      examples: ["a"],
      deprecated: true,
      extra: true,
    });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "check",
        call("check", [t.callExpression(t.identifier("z.minLength"), [])]),
      ),
    ).toEqual({ type: "string" });

    expect(applyZodChainMethod(converter, { type: "array" }, "min", call("min"))).toMatchObject({
      minItems: 2,
    });
    expect(applyZodChainMethod(converter, { type: "array" }, "max", call("max"))).toMatchObject({
      maxItems: 2,
    });
    expect(
      applyZodChainMethod(converter, { type: "array" }, "length", call("length")),
    ).toMatchObject({
      minItems: 2,
      maxItems: 2,
    });
    expect(
      applyZodChainMethod(converter, { type: "array" }, "nonempty", call("nonempty")),
    ).toMatchObject({
      minItems: 1,
    });
    expect(
      applyZodChainMethod(
        converter,
        { type: "array", items: { type: "string" } },
        "rest",
        call("rest", [t.identifier("z")]),
      ),
    ).toMatchObject({ type: "array", items: { type: "string" } });
    expect(
      applyZodChainMethod(
        { ...converter, resolveStringArg: () => undefined },
        { type: "string" },
        "describe",
        call("describe"),
      ),
    ).toEqual({ type: "string" });

    expect(
      applyZodChainMethod(
        {
          ...converter,
          processZodNode() {
            return {
              type: "object",
              properties: { email: { type: "string" } },
              required: ["email"],
            };
          },
        },
        { type: "object", properties: { id: { type: "string" } } },
        "merge",
        call("merge", [t.identifier("Extra")]),
      ),
    ).toMatchObject({
      properties: {
        id: { type: "string" },
        email: { type: "string" },
      },
      required: ["email"],
    });
  });

  it("covers leftover optional, omit, partial, pipe, and unknown-method conversions", () => {
    const converter = {
      ...host(),
      extractMaskKeysFromNode() {
        return ["name"];
      },
      extractStaticJsonValue() {
        return "fallback";
      },
      processZodNode() {
        return { type: "number" as const };
      },
    };
    const objectSchema = (): OpenApiSchema => ({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    });

    expect(
      applyZodChainMethod(converter, { type: "string" }, "optional", call("optional")),
    ).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "nullable", call("nullable")),
    ).toMatchObject({
      type: "string",
      nullable: true,
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "nullish", call("nullish")),
    ).toMatchObject({
      type: "string",
      nullable: true,
    });
    expect(applyZodChainMethod(converter, objectSchema(), "omit", call("omit"))).toMatchObject({
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(
      applyZodChainMethod(converter, objectSchema(), "partial", call("partial")),
    ).toMatchObject({
      required: ["id"],
    });
    expect(
      applyZodChainMethod(
        { ...converter, extractMaskKeysFromNode: () => [] },
        objectSchema(),
        "partial",
        call("partial"),
      ),
    ).toEqual({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
    });
    expect(
      applyZodChainMethod(converter, objectSchema(), "required", call("required")),
    ).toMatchObject({
      required: ["id", "name"],
    });
    expect(applyZodChainMethod(converter, objectSchema(), "keyof", call("keyof"))).toEqual({
      type: "string",
      enum: ["id", "name"],
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "pipe", call("pipe", [t.identifier("z")])),
    ).toMatchObject({ type: "number" });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "or", call("or", [t.identifier("z")])),
    ).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "and", call("and", [t.identifier("z")])),
    ).toEqual({
      allOf: [{ type: "string" }, { type: "number" }],
    });
    expect(
      applyZodChainMethod(converter, { type: "object" }, "strict", call("strict")),
    ).toMatchObject({
      additionalProperties: false,
    });
    expect(applyZodChainMethod(converter, { type: "object" }, "strip", call("strip"))).toEqual({
      type: "object",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "brand", call("brand"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "transform", call("transform")),
    ).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "overwrite", call("overwrite")),
    ).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "nonoptional", call("nonoptional")),
    ).toEqual({ type: "string" });
    expect(applyZodChainMethod(converter, { type: "string" }, "refine", call("refine"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "superRefine", call("superRefine")),
    ).toEqual({ type: "string" });
    expect(applyZodChainMethod(converter, { type: "string" }, "trim", call("trim"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "toLowerCase", call("toLowerCase")),
    ).toEqual({ type: "string" });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "toUpperCase", call("toUpperCase")),
    ).toEqual({ type: "string" });
    expect(applyZodChainMethod(converter, { type: "number" }, "finite", call("finite"))).toEqual({
      type: "number",
    });
    expect(
      applyZodChainMethod(converter, { type: "number" }, "nonnegative", call("nonnegative")),
    ).toMatchObject({ minimum: 0 });
    expect(
      applyZodChainMethod(converter, { type: "number" }, "negative", call("negative")),
    ).toMatchObject({ exclusiveMaximum: 0 });
    expect(
      applyZodChainMethod(converter, { type: "number" }, "nonpositive", call("nonpositive")),
    ).toMatchObject({ maximum: 0 });
    expect(applyZodChainMethod(converter, { type: "number" }, "step", call("step"))).toEqual({
      type: "number",
    });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "prefault",
        call("prefault", [t.stringLiteral("x")]),
      ),
    ).toMatchObject({ default: "fallback" });
    expect(
      applyZodChainMethod(
        { ...converter, extractMaskKeysFromNode: () => [] },
        objectSchema(),
        "pick",
        call("pick"),
      ),
    ).toMatchObject({
      properties: { id: { type: "string" }, name: { type: "string" } },
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "unknownMethod", call("unknownMethod")),
    ).toEqual({ type: "string" });
    expect(
      applyZodChainMethod(
        {
          ...converter,
          applyDeepPartial: (schema: OpenApiSchema) => {
            schema.description = "partial";
          },
        },
        { type: "object" },
        "deepPartial",
        call("deepPartial"),
      ),
    ).toMatchObject({ description: "partial" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "string" },
        "extend",
        call("extend", [
          t.objectExpression([
            t.objectProperty(
              t.identifier("id"),
              t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
            ),
          ]),
        ]),
      ),
    ).toEqual({ type: "number" });
  });

  it("covers leftover undefined-arg and non-object chain sides", () => {
    const converter = host();
    const restPlaceholder = call("rest");
    restPlaceholder.arguments = [t.argumentPlaceholder()];

    expect(applyZodChainMethod(converter, { type: "string" }, "min", call("min"))).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "max", call("max"))).toEqual({
      type: "number",
    });
    expect(applyZodChainMethod(converter, { type: "array" }, "length", call("length"))).toEqual({
      type: "array",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "regex", call("regex"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "startsWith", call("startsWith")),
    ).toEqual({ type: "string" });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "endsWith", call("endsWith")),
    ).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "includes", call("includes")),
    ).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "number" }, "step", call("step"))).toEqual({
      type: "number",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "minSize", call("minSize"))).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "maxSize", call("maxSize"))).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "array" }, "rest", restPlaceholder)).toEqual({
      type: "array",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "catchall", call("catchall")),
    ).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "strict", call("strict"))).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "keyof", call("keyof"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(converter, { type: "string" }, "required", call("required")),
    ).toEqual({
      type: "string",
    });
    expect(applyZodChainMethod(converter, { type: "object" }, "merge", call("merge"))).toEqual({
      type: "object",
    });
    expect(applyZodChainMethod(converter, { type: "string" }, "pipe", call("pipe"))).toEqual({
      type: "string",
    });
    expect(
      applyZodChainMethod(
        { ...converter, processZodNode: () => ({ type: "string" as const }) },
        { type: "string" },
        "or",
        call("or", [t.identifier("Alt")]),
      ),
    ).toEqual({ anyOf: [{ type: "string" }, { type: "string" }] });
    expect(
      applyZodChainMethod(
        { ...converter, processZodNode: () => undefined as never },
        { type: "string" },
        "and",
        call("and", [t.identifier("Alt")]),
      ),
    ).toEqual({ type: "string" });
    expect(
      applyZodChainMethod(
        converter,
        { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        "omit",
        call("omit"),
      ),
    ).toMatchObject({ required: [] });
    expect(
      applyZodChainMethod(
        {
          ...converter,
          extractMaskKeysFromNode: () => ["missing"],
        },
        { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        "partial",
        call("partial"),
      ),
    ).toMatchObject({ required: ["id"] });
  });
});
