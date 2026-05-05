import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › primitives", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  const cases: Array<[label: string, source: string, expected: unknown]> = [
    ["z.string()", "z.string()", { type: "string" }],
    ["z.number()", "z.number()", { type: "number" }],
    ["z.number().int()", "z.number().int()", { type: "integer" }],
    ["z.boolean()", "z.boolean()", { type: "boolean" }],
    ["z.date()", "z.date()", { type: "string", format: "date-time" }],
    ["z.bigint()", "z.bigint()", { type: "integer", format: "int64" }],
    ["z.null()", "z.null()", { type: "null" }],
    ["z.undefined()", "z.undefined()", { type: "null" }],
    ["z.void()", "z.void()", { type: "null" }],
    ["z.never()", "z.never()", { not: {} }],
    ["z.any()", "z.any()", {}],
    ["z.unknown()", "z.unknown()", {}],
    ["z.nan()", "z.nan()", { type: "number" }],
    ["z.file()", "z.file()", { type: "string", format: "binary" }],
    ['z.literal("hello")', 'z.literal("hello")', { type: "string", enum: ["hello"] }],
    ["z.literal(42)", "z.literal(42)", { type: "integer", enum: [42] }],
    ["z.literal(true)", "z.literal(true)", { type: "boolean", enum: [true] }],
    ["z.literal(null)", "z.literal(null)", { type: "null", enum: [null] }],
  ];

  it.each(cases)("%s", (_label, source, expected) => {
    expect(convert(source, roots)).toEqual(expected);
  });
});
