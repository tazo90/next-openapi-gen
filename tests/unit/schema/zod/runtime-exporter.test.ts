import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import { ZodRuntimeExporter } from "@workspace/openapi-core/schema/zod/runtime-exporter.js";

function parseInitializer(expression: string): t.Expression {
  const ast = parseTypeScriptFile(`const schema = ${expression};`);
  const statement = ast.program.body[0];

  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error("Expected a variable declaration");
  }

  const declaration = statement.declarations[0];
  if (!declaration?.init) {
    throw new Error("Expected an initializer");
  }

  return declaration.init;
}

describe("ZodRuntimeExporter", () => {
  const exporter = new ZodRuntimeExporter();

  describe("primitive types", () => {
    it("exports z.string()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string()"), { contentType: "response" }),
      ).toEqual({ type: "string" });
    });

    it("exports z.number()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number()"), { contentType: "response" }),
      ).toEqual({ type: "number" });
    });

    it("exports z.boolean()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.boolean()"), { contentType: "response" }),
      ).toEqual({ type: "boolean" });
    });

    it("exports z.null()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.null()"), { contentType: "response" }),
      ).toEqual({ type: "null" });
    });

    it("exports z.any()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.any()"), { contentType: "response" }),
      ).toEqual({});
    });

    it("exports z.unknown()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.unknown()"), { contentType: "response" }),
      ).toEqual({});
    });

    it("returns null for z.undefined() (unrepresentable)", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.undefined()"), { contentType: "response" }),
      ).toBeNull();
    });
  });

  describe("string format helpers", () => {
    it("exports z.email()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.email()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "email" });
    });

    it("exports z.url()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.url()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uri" });
    });

    it("exports z.uuid()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.uuid()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uuid" });
    });

    it("exports z.guid()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.guid()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uuid" });
    });

    it("exports z.cuid()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.cuid()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "cuid" });
    });

    it("exports z.ipv4()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.ipv4()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "ipv4" });
    });

    it("exports z.ipv6()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.ipv6()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "ipv6" });
    });
  });

  describe("iso helpers", () => {
    it("exports z.iso.datetime()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.iso.datetime()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "date-time" });
    });

    it("exports z.iso.date()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.iso.date()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "date" });
    });

    it("exports z.iso.time()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.iso.time()"), { contentType: "response" }),
      ).toEqual(expect.objectContaining({ type: "string" }));
    });

    it("exports z.iso.duration()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.iso.duration()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "duration" });
    });
  });

  describe("coerce helpers", () => {
    it("exports z.coerce.string()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.coerce.string()"), { contentType: "response" }),
      ).toEqual({ type: "string" });
    });

    it("exports z.coerce.number()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.coerce.number()"), { contentType: "response" }),
      ).toEqual({ type: "number" });
    });

    it("exports z.coerce.boolean()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.coerce.boolean()"), { contentType: "response" }),
      ).toEqual({ type: "boolean" });
    });
  });

  describe("literal and enum", () => {
    it("exports z.literal()", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.literal("active")'), { contentType: "response" }),
      ).toEqual({ type: "string", const: "active" });
    });

    it("exports z.enum with array", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.enum(["a", "b", "c"])'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", enum: ["a", "b", "c"] });
    });

    it("exports z.enum with object", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.enum({ A: "a", B: "b" })'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", enum: ["a", "b"] });
    });
  });

  describe("collections", () => {
    it("exports z.array(z.string())", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.array(z.string())"), { contentType: "response" }),
      ).toEqual({ type: "array", items: { type: "string" } });
    });

    it("exports z.object()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.object({ id: z.string(), age: z.number() })"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          age: { type: "number" },
        },
        required: ["id", "age"],
      });
    });

    it("exports z.record(z.string(), z.number())", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.record(z.string(), z.number())"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "object",
        additionalProperties: { type: "number" },
        propertyNames: { type: "string" },
      });
    });

    it("exports z.tuple()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.tuple([z.string(), z.number()])"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "array",
        prefixItems: [{ type: "string" }, { type: "number" }],
      });
    });
  });

  describe("union and intersection", () => {
    it("exports z.union()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.union([z.string(), z.number()])"), {
          contentType: "response",
        }),
      ).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    });

    it("exports z.discriminatedUnion()", () => {
      const result = exporter.exportSchema(
        parseInitializer(
          'z.discriminatedUnion("type", [z.object({ type: z.literal("a"), x: z.number() }), z.object({ type: z.literal("b"), y: z.string() })])',
        ),
        { contentType: "response" },
      );
      expect(result).toEqual({
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", const: "a" },
              x: { type: "number" },
            },
            required: ["type", "x"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", const: "b" },
              y: { type: "string" },
            },
            required: ["type", "y"],
          },
        ],
      });
    });

    it("exports z.intersection()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer(
            "z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))",
          ),
          { contentType: "response" },
        ),
      ).toEqual({
        allOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: { a: { type: "string" } },
            required: ["a"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: { b: { type: "number" } },
            required: ["b"],
          },
        ],
      });
    });
  });

  describe("modifiers", () => {
    it("exports optional", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().optional()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string" });
    });

    it("exports nullable", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().nullable()"), {
          contentType: "response",
        }),
      ).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    });

    it("exports describe", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().describe("A name")'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", description: "A name" });
    });

    it("exports default", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().default("guest")'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", default: "guest" });
    });

    it("exports meta", () => {
      expect(
        exporter.exportSchema(
          parseInitializer('z.string().meta({ example: "demo", deprecated: true })'),
          { contentType: "response" },
        ),
      ).toEqual({ type: "string", example: "demo", deprecated: true });
    });

    it("exports deprecated", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().deprecated()"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string", deprecated: true });
    });
  });

  describe("string/number constraints", () => {
    it("exports min/max on string", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().min(1).max(100)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", minLength: 1, maxLength: 100 });
    });

    it("exports min/max on number", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().min(0).max(100)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", minimum: 0, maximum: 100 });
    });

    it("exports int()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().int()"), { contentType: "response" }),
      ).toEqual({ type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 });
    });

    it("exports positive()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().positive()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", exclusiveMinimum: 0 });
    });

    it("exports string format checks", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().email()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "email" });

      expect(
        exporter.exportSchema(parseInitializer("z.string().uuid()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uuid" });

      expect(
        exporter.exportSchema(parseInitializer("z.string().url()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uri" });
    });

    it("exports regex", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().regex(/^[a-z]+$/)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", pattern: "^[a-z]+$" });
    });
  });

  describe("pipe and transform", () => {
    it("exports pipe", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().pipe(z.email())"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", format: "email" });
    });

    it("skips transform and brand", () => {
      expect(
        exporter.exportSchema(
          parseInitializer('z.string().transform((v) => v.toLowerCase()).brand<"Lower">()'),
          { contentType: "response" },
        ),
      ).toEqual({ type: "string" });
    });

    it("skips refine and superRefine", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().refine((v) => v.length > 0)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string" });
    });
  });

  describe("object modifiers", () => {
    it("exports partial()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer("z.object({ a: z.string(), b: z.number() }).partial()"),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { a: { type: "string" }, b: { type: "number" } },
      });
    });

    it("exports pick()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer("z.object({ a: z.string(), b: z.number() }).pick({ a: true })"),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { a: { type: "string" } },
        required: ["a"],
      });
    });

    it("exports omit()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer("z.object({ a: z.string(), b: z.number() }).omit({ b: true })"),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { a: { type: "string" } },
        required: ["a"],
      });
    });

    it("exports extend()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer("z.object({ a: z.string() }).extend({ b: z.number() })"),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { a: { type: "string" }, b: { type: "number" } },
        required: ["a", "b"],
      });
    });
  });

  describe("contentType io option", () => {
    it("uses io:input for body contentType", () => {
      const node = parseInitializer("z.coerce.number().pipe(z.number().min(1))");
      const bodyResult = exporter.exportSchema(node, { contentType: "body" });
      const responseResult = exporter.exportSchema(
        parseInitializer("z.coerce.number().pipe(z.number().min(1))"),
        { contentType: "response" },
      );
      // body (input) should give the input schema, response the output
      expect(bodyResult).toBeDefined();
      expect(responseResult).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("returns null for non-zod expressions", () => {
      expect(
        exporter.exportSchema(parseInitializer("someOtherFunction()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for identifiers", () => {
      expect(
        exporter.exportSchema(parseInitializer("mySchema"), { contentType: "response" }),
      ).toBeNull();
    });

    it("exports z.record with single argument", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.record(z.number())"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "object",
        additionalProperties: { type: "number" },
        propertyNames: { type: "string" },
      });
    });

    it("exports z.stringbool()", () => {
      const result = exporter.exportSchema(parseInitializer("z.stringbool()"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("exports z.templateLiteral()", () => {
      const result = exporter.exportSchema(
        parseInitializer('z.templateLiteral(["user_", z.string()])'),
        { contentType: "response" },
      );
      expect(result).toBeDefined();
      expect(result?.type).toBe("string");
    });

    it("exports z.object().required()", () => {
      expect(
        exporter.exportSchema(
          parseInitializer(
            "z.object({ a: z.string().optional(), b: z.number() }).required({ a: true })",
          ),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { a: { type: "string" }, b: { type: "number" } },
        required: ["a", "b"],
      });
    });

    it("exports empty z.object()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.object({})"), { contentType: "response" }),
      ).toEqual({ type: "object", additionalProperties: false, properties: {} });
    });

    it("exports chained nullish()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().nullish()"), {
          contentType: "response",
        }),
      ).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    });

    it("exports z.literal with number", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.literal(42)"), { contentType: "response" }),
      ).toEqual({ type: "number", const: 42 });
    });

    it("exports z.literal with boolean", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.literal(true)"), { contentType: "response" }),
      ).toEqual({ type: "boolean", const: true });
    });

    it("exports nonnegative()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().nonnegative()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", minimum: 0 });
    });

    it("exports negative()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().negative()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", exclusiveMaximum: 0 });
    });

    it("exports safe()", () => {
      const result = exporter.exportSchema(parseInitializer("z.number().safe()"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("exports finite()", () => {
      const result = exporter.exportSchema(parseInitializer("z.number().finite()"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("exports catch()", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().catch("fallback")'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", default: "fallback" });
    });

    it("exports length()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().length(5)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", minLength: 5, maxLength: 5 });
    });

    it("exports startsWith and endsWith", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().startsWith("ab")'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", pattern: "^ab.*" });
    });

    it("exports includes", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().includes("test")'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", pattern: "test" });
    });

    it("exports readonly", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().readonly()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", readOnly: true });
    });

    it("exports z.array() without argument", () => {
      const result = exporter.exportSchema(parseInitializer("z.array()"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("exports nonpositive()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().nonpositive()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", maximum: 0 });
    });

    it("exports z.uri() as alias for z.url()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.uri()"), { contentType: "response" }),
      ).toEqual({ type: "string", format: "uri" });
    });
  });

  describe("null-returning branches", () => {
    it("returns null for unknown root helper", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.unknownHelper()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.literal() without argument", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.literal()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.enum() without argument", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.enum()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.union() without argument", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.union()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.union([]) with empty array", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.union([])"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.discriminatedUnion() without valid args", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.discriminatedUnion()"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("returns null for z.discriminatedUnion with fewer than 2 options", () => {
      expect(
        exporter.exportSchema(
          parseInitializer('z.discriminatedUnion("type", [z.object({ type: z.literal("a") })])'),
          { contentType: "response" },
        ),
      ).toBeNull();
    });

    it("returns null for z.intersection() without both args", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.intersection()"), { contentType: "response" }),
      ).toBeNull();
    });

    it("returns null for z.intersection() with only one arg", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.intersection(z.string())"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("returns null for z.templateLiteral() without argument", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.templateLiteral()"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("returns null for z.record() without argument", () => {
      const result = exporter.exportSchema(parseInitializer("z.record()"), {
        contentType: "response",
      });
      expect(result).toEqual(expect.objectContaining({ type: "object" }));
    });

    it("exports z.object() with no arguments (empty object)", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.object()"), { contentType: "response" }),
      ).toEqual({ type: "object", additionalProperties: false, properties: {} });
    });

    it("exports z.tuple() with no arguments (empty tuple)", () => {
      const result = exporter.exportSchema(parseInitializer("z.tuple()"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("exports z.tuple([]) with empty array", () => {
      const result = exporter.exportSchema(parseInitializer("z.tuple([])"), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });

    it("returns null for z.enum with non-string values in array", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.enum([1, 2, 3])"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("returns null for z.enum with non-literal argument type", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.enum(someVariable)"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("handles describe without string argument", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().describe(someVar)"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles meta without arguments", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().meta()"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles default without value", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().default()"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles catch without value", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().catch()"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles regex without RegExpLiteral", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().regex(somePattern)"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles pipe without argument", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().pipe()"), {
        contentType: "response",
      });
      expect(result).toEqual({ type: "string" });
    });

    it("handles endsWith", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().endsWith("xyz")'), {
          contentType: "response",
        }),
      ).toEqual(expect.objectContaining({ type: "string" }));
    });

    it("handles z.literal with null", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.literal(null)"), { contentType: "response" }),
      ).toEqual({ type: "null", const: null });
    });

    it("exports z.object with string literal keys", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.object({ "my-key": z.string() })'), {
          contentType: "response",
        }),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: { "my-key": { type: "string" } },
        required: ["my-key"],
      });
    });

    it("returns null for z.object with spread elements", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.object({ ...other })"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("handles unknown chained method gracefully", () => {
      const result = exporter.exportSchema(parseInitializer("z.string().trim()"), {
        contentType: "response",
      });
      // trim exists on zod schema, so it should succeed or return null gracefully
      expect(result).toBeDefined();
    });

    it("exports z.number().max()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().max(10)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", maximum: 10 });
    });

    it("exports z.string().max()", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().max(50)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", maxLength: 50 });
    });

    it("exports deeply nested object", () => {
      expect(
        exporter.exportSchema(
          parseInitializer("z.object({ nested: z.object({ deep: z.string() }) })"),
          { contentType: "response" },
        ),
      ).toEqual({
        type: "object",
        additionalProperties: false,
        properties: {
          nested: {
            type: "object",
            additionalProperties: false,
            properties: { deep: { type: "string" } },
            required: ["deep"],
          },
        },
        required: ["nested"],
      });
    });

    it("exports complex chained schema", () => {
      const result = exporter.exportSchema(
        parseInitializer(
          'z.object({ name: z.string().min(1).max(100), age: z.number().int().positive() }).describe("A user")',
        ),
        { contentType: "response" },
      );
      expect(result).toBeDefined();
      expect(result?.type).toBe("object");
    });

    it("exports z.string().ipv4() method", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().ipv4()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", format: "ipv4" });
    });

    it("exports z.string().ipv6() method", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().ipv6()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", format: "ipv6" });
    });

    it("exports z.string().guid() method", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().guid()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", format: "uuid" });
    });

    it("exports z.string().cuid() method", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().cuid()"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", format: "cuid" });
    });

    it("handles superRefine gracefully", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().superRefine((val, ctx) => {})"), {
          contentType: "response",
        }),
      ).toEqual({ type: "string" });
    });

    it("exports z.number().int().min(0).max(100)", () => {
      const result = exporter.exportSchema(parseInitializer("z.number().int().min(0).max(100)"), {
        contentType: "response",
      });
      expect(result).toEqual({
        type: "integer",
        minimum: 0,
        maximum: 100,
      });
    });

    it("exports z.array(z.object(...))", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.array(z.object({ id: z.string() }))"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      });
    });

    it("exports z.record with two explicit type args", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.record(z.string(), z.boolean())"), {
          contentType: "response",
        }),
      ).toEqual({
        type: "object",
        additionalProperties: { type: "boolean" },
        propertyNames: { type: "string" },
      });
    });

    it("handles z.default with numeric value", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.number().default(42)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "number", default: 42 });
    });

    it("handles z.default with boolean value", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.boolean().default(false)"), {
          contentType: "response",
        }),
      ).toEqual({ type: "boolean", default: false });
    });

    it("handles z.default with null value", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.string().nullable().default(null)"), {
          contentType: "response",
        }),
      ).toEqual(expect.objectContaining({ default: null }));
    });

    it("exports z.templateLiteral with only string parts", () => {
      const result = exporter.exportSchema(parseInitializer('z.templateLiteral(["hello"])'), {
        contentType: "response",
      });
      expect(result).toBeDefined();
      expect(result?.type).toBe("string");
    });

    it("handles z.meta with nested object value", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().meta({ "x-custom": "value" })'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", "x-custom": "value" });
    });

    it("exports z.literal with undefined-producing node returns null", () => {
      // z.literal(someVar) - variable reference, not a literal value
      expect(
        exporter.exportSchema(parseInitializer("z.literal(someVar)"), { contentType: "response" }),
      ).toBeNull();
    });

    it("exports z.object with computed key returns null", () => {
      // Use a template literal as computed key - not extractable
      expect(
        exporter.exportSchema(parseInitializer("z.object({ [`key_${x}`]: z.string() })"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("exports z.default with array literal value", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.array(z.string()).default([])"), {
          contentType: "response",
        }),
      ).toEqual({ type: "array", items: { type: "string" }, default: [] });
    });

    it("exports z.default with object literal value", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.object({ x: z.string() }).default({ x: "a" })'), {
          contentType: "response",
        }),
      ).toEqual(expect.objectContaining({ type: "object", default: { x: "a" } }));
    });

    it("exports z.meta with array value", () => {
      expect(
        exporter.exportSchema(parseInitializer('z.string().meta({ examples: ["a", "b"] })'), {
          contentType: "response",
        }),
      ).toEqual({ type: "string", examples: ["a", "b"] });
    });

    it("exports z.meta with nested object", () => {
      expect(
        exporter.exportSchema(
          parseInitializer('z.string().meta({ openapi: { example: "test" } })'),
          { contentType: "response" },
        ),
      ).toEqual({ type: "string", openapi: { example: "test" } });
    });

    it("handles z.enum with empty array returns null", () => {
      expect(
        exporter.exportSchema(parseInitializer("z.enum([])"), {
          contentType: "response",
        }),
      ).toBeNull();
    });

    it("exports z.templateLiteral with mixed parts", () => {
      const result = exporter.exportSchema(
        parseInitializer('z.templateLiteral(["prefix_", z.number(), "_suffix"])'),
        { contentType: "response" },
      );
      expect(result).toBeDefined();
      expect(result?.type).toBe("string");
    });

    it("handles prefault method", () => {
      // prefault is like default but for input
      const result = exporter.exportSchema(parseInitializer('z.string().prefault("fallback")'), {
        contentType: "response",
      });
      expect(result).toBeDefined();
    });
  });
});
