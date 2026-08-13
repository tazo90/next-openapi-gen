import { afterEach, describe, expect, it } from "vitest";

import { cleanup, convert } from "./_helpers.js";

describe("Zod features › string formats", () => {
  const roots: string[] = [];
  afterEach(() => cleanup(roots));

  const formatCases: Array<[label: string, source: string, expected: unknown]> = [
    ["email (method)", "z.string().email()", { type: "string", format: "email" }],
    ["url (method)", "z.string().url()", { type: "string", format: "uri" }],
    ["uuid (method)", "z.string().uuid()", { type: "string", format: "uuid" }],
    ["uuidv4 (method)", "z.string().uuidv4()", { type: "string", format: "uuid" }],
    ["uuidv6 (method)", "z.string().uuidv6()", { type: "string", format: "uuid" }],
    ["uuidv7 (method)", "z.string().uuidv7()", { type: "string", format: "uuid" }],
    ["cuid (method)", "z.string().cuid()", { type: "string", pattern: "^c[^\\s-]{8,}$" }],
    ["cuid2", "z.string().cuid2()", { type: "string", pattern: "^[0-9a-z]+$" }],
    ["ulid", "z.string().ulid()", { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{26}$" }],
    ["nanoid", "z.string().nanoid()", { type: "string", pattern: "^[A-Za-z0-9_-]{21}$" }],
    ["xid", "z.string().xid()", { type: "string", pattern: "^[0-9a-v]{20}$" }],
    ["ksuid", "z.string().ksuid()", { type: "string", pattern: "^[0-9A-Za-z]{27}$" }],
    [
      "jwt",
      "z.string().jwt()",
      { type: "string", pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$" },
    ],
    ["hostname", "z.string().hostname()", { type: "string", format: "hostname" }],
    ["httpUrl", "z.string().httpUrl()", { type: "string", format: "uri" }],
    ["hex", "z.string().hex()", { type: "string", pattern: "^[0-9a-fA-F]+$" }],
    ["hash", "z.string().hash('sha256')", { type: "string" }],
    ["base64", "z.string().base64()", { type: "string", contentEncoding: "base64" }],
    ["base64url", "z.string().base64url()", { type: "string", contentEncoding: "base64url" }],
    ["emoji", "z.string().emoji()", { type: "string" }],
    [
      "ip",
      "z.string().ip()",
      {
        anyOf: [
          { type: "string", format: "ipv4" },
          { type: "string", format: "ipv6" },
        ],
      },
    ],
    ["ipv4 (method)", "z.string().ipv4()", { type: "string", format: "ipv4" }],
    ["ipv6 (method)", "z.string().ipv6()", { type: "string", format: "ipv6" }],
    [
      "cidr",
      "z.string().cidr()",
      {
        anyOf: [
          { type: "string", format: "ipv4-cidr" },
          { type: "string", format: "ipv6-cidr" },
        ],
      },
    ],
    ["cidrv4", "z.string().cidrv4()", { type: "string", format: "ipv4-cidr" }],
    ["cidrv6", "z.string().cidrv6()", { type: "string", format: "ipv6-cidr" }],
    ["e164", "z.string().e164()", { type: "string", pattern: "^\\+[1-9]\\d{1,14}$" }],
    ["datetime", "z.string().datetime()", { type: "string", format: "date-time" }],
    ["date", "z.string().date()", { type: "string", format: "date" }],
    ["time", "z.string().time()", { type: "string", format: "time" }],
    ["duration", "z.string().duration()", { type: "string", format: "duration" }],
  ];

  it.each(formatCases)("%s", (_label, source, expected) => {
    expect(convert(source, roots)).toEqual(expected);
  });

  it("regex() captures the pattern", () => {
    const schema = convert("z.string().regex(/^[a-z]+$/)", roots);
    expect(schema).toMatchObject({ type: "string", pattern: "^[a-z]+$" });
  });

  it("min/max/length emit the corresponding keywords", () => {
    expect(convert("z.string().min(3)", roots)).toMatchObject({ type: "string", minLength: 3 });
    expect(convert("z.string().max(10)", roots)).toMatchObject({ type: "string", maxLength: 10 });
    expect(convert("z.string().length(5)", roots)).toMatchObject({
      type: "string",
      minLength: 5,
      maxLength: 5,
    });
  });

  it("string normalization methods are no-ops for wire shape", () => {
    expect(convert("z.string().trim().toLowerCase().toUpperCase()", roots)).toEqual({
      type: "string",
    });
  });

  it("startsWith/endsWith/includes produce a pattern", () => {
    const starts = convert('z.string().startsWith("foo")', roots);
    expect(starts).toMatchObject({ type: "string" });
    expect(typeof (starts as { pattern?: string }).pattern).toBe("string");
    expect((starts as { pattern: string }).pattern).toMatch(/foo/);

    const ends = convert('z.string().endsWith("bar")', roots);
    expect(typeof (ends as { pattern?: string }).pattern).toBe("string");
    expect((ends as { pattern: string }).pattern).toMatch(/bar/);

    const includes = convert('z.string().includes("baz")', roots);
    expect(typeof (includes as { pattern?: string }).pattern).toBe("string");
    expect((includes as { pattern: string }).pattern).toMatch(/baz/);
  });
});
