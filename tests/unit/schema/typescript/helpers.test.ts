import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  createFormDataSchema,
  createTypeReferenceFromString,
  detectContentType,
  extractKeysFromLiteralType,
  getExampleForParam,
  getPropertyOptions,
  getSchemaProcessorErrorMessage,
  isDateNode,
  isDateObject,
  isDateString,
  normalizeSchemaDirs,
  normalizeSchemaTypes,
  parseGenericTypeString,
  splitGenericTypeArguments,
} from "@workspace/openapi-core/schema/typescript/helpers.js";

describe("TypeScript schema helpers", () => {
  it("parses and reconstructs generic type strings", () => {
    expect(normalizeSchemaTypes("typescript")).toEqual(["typescript"]);
    expect(normalizeSchemaDirs("./src")).toEqual(["./src"]);
    expect(getSchemaProcessorErrorMessage("boom")).toBe("boom");
    expect(splitGenericTypeArguments("User, Paginated<Post>, Result<Comment[]>")).toEqual([
      "User",
      "Paginated<Post>",
      "Result<Comment[]>",
    ]);
    expect(parseGenericTypeString("Envelope<User, Result<Post>>")).toEqual({
      baseTypeName: "Envelope",
      typeArguments: ["User", "Result<Post>"],
    });
    expect(parseGenericTypeString("<User>")).toBeNull();
    expect(parseGenericTypeString("User")).toBeNull();
    expect(createTypeReferenceFromString("Envelope<User>").typeParameters.params).toHaveLength(1);
    expect(createTypeReferenceFromString("Broken<").typeName.name).toBe("Broken<");
  });

  it("extracts property metadata and literal key names", () => {
    const property = t.tsPropertySignature(
      t.identifier("label"),
      t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    property.optional = true;
    // JSDoc comments precede their property (leading), not follow it (trailing).
    property.leadingComments = [{ type: "CommentLine", value: " display name" }] as never;

    expect(getPropertyOptions(property, "body")).toEqual({
      description: "display name",
      nullable: true,
    });
    expect(extractKeysFromLiteralType(t.tsLiteralType(t.stringLiteral("slug")))).toEqual(["slug"]);
    expect(
      extractKeysFromLiteralType(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.stringLiteral("b")),
        ]),
      ),
    ).toEqual(["a", "b"]);
  });

  it("parses @example and @format JSDoc tags from property leading comments", () => {
    const makeProperty = (commentValue: string, commentType = "CommentBlock") => {
      const prop = t.tsPropertySignature(
        t.identifier("x"),
        t.tsTypeAnnotation(t.tsStringKeyword()),
      );
      prop.leadingComments = [{ type: commentType, value: commentValue }] as never;
      return prop;
    };

    // /** @example "alive" */ → example only, no description
    expect(getPropertyOptions(makeProperty('* @example "alive" '), "response")).toEqual({
      example: "alive",
    });

    // /** @format date-time @example "2025-11-26T22:00:00.000Z" */
    expect(
      getPropertyOptions(
        makeProperty('* @format date-time @example "2025-11-26T22:00:00.000Z" '),
        "response",
      ),
    ).toEqual({
      format: "date-time",
      example: "2025-11-26T22:00:00.000Z",
    });

    // /** Process uptime in seconds @example 123.45 */ → description + numeric example
    expect(
      getPropertyOptions(makeProperty("* Process uptime in seconds @example 123.45 "), "response"),
    ).toEqual({
      description: "Process uptime in seconds",
      example: 123.45,
    });

    // No comment → empty options (except nullable for body)
    const bare = t.tsPropertySignature(t.identifier("y"), t.tsTypeAnnotation(t.tsStringKeyword()));
    expect(getPropertyOptions(bare, "response")).toEqual({});
  });

  it("falls back to trailing comments when no leading comment is attached", () => {
    // Backward compatibility: `name: string; // description` keeps working.
    const trailingOnly = t.tsPropertySignature(
      t.identifier("email"),
      t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    trailingOnly.trailingComments = [{ type: "CommentLine", value: " user email" }] as never;
    expect(getPropertyOptions(trailingOnly, "response")).toEqual({
      description: "user email",
    });

    // CommentBlock (JSDoc) leading wins over trailing inline comment.
    // In real Babel ASTs a JSDoc block above a property appears as CommentBlock in
    // leadingComments, while the trailing slot holds the *next* property's JSDoc.
    const both = t.tsPropertySignature(
      t.identifier("token"),
      t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    both.leadingComments = [{ type: "CommentBlock", value: "* auth token" }] as never;
    both.trailingComments = [{ type: "CommentLine", value: " ignored" }] as never;
    expect(getPropertyOptions(both, "response")).toEqual({
      description: "auth token",
    });

    // CommentLine in leadingComments is treated as a Babel duplicate of the previous
    // property's trailing inline comment and is therefore ignored when trailingComments
    // is also present — the trailing comment (current property's own inline doc) wins.
    const lineLeadingPlusTailing = t.tsPropertySignature(
      t.identifier("name"),
      t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    lineLeadingPlusTailing.leadingComments = [
      { type: "CommentLine", value: " prev prop comment (Babel duplicate)" },
    ] as never;
    lineLeadingPlusTailing.trailingComments = [
      { type: "CommentLine", value: " real description" },
    ] as never;
    expect(getPropertyOptions(lineLeadingPlusTailing, "response")).toEqual({
      description: "real description",
    });

    // Trailing comments parse @example and @format just like leading ones.
    const trailingWithTags = t.tsPropertySignature(
      t.identifier("uptime"),
      t.tsTypeAnnotation(t.tsNumberKeyword()),
    );
    trailingWithTags.trailingComments = [
      { type: "CommentLine", value: " Process uptime in seconds @example 123.45" },
    ] as never;
    expect(getPropertyOptions(trailingWithTags, "response")).toEqual({
      description: "Process uptime in seconds",
      example: 123.45,
    });
  });

  it("detects dates, examples, content types, and form-data conversion", () => {
    expect(isDateString(t.stringLiteral("2026-03-27T10:00:00Z"))).toBe(true);
    expect(isDateObject(t.newExpression(t.identifier("Date"), []))).toBe(true);
    expect(isDateNode(t.stringLiteral("not-a-date"))).toBe(false);

    expect(getExampleForParam("id", "string")).toBe("123");
    expect(getExampleForParam("count", "number")).toBe(1);
    expect(getExampleForParam("enabled", "boolean")).toBe(true);
    expect(getExampleForParam("date")).toBe("2023-01-01");
    expect(getExampleForParam("role")).toBe("admin");
    expect(getExampleForParam("custom", "other")).toBe("example");
    expect(detectContentType("UserBody", "text/plain")).toBe("text/plain");
    expect(detectContentType("MultipartFormData")).toBe("multipart/form-data");
    expect(detectContentType("UserBody")).toBe("application/json");

    expect(createFormDataSchema({ type: "object" })).toEqual({ type: "object" });
    expect(
      createFormDataSchema({
        type: "object",
        properties: {
          avatarFile: {
            type: "object",
            description: "profile file",
          },
          note: {
            type: "string",
          },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        avatarFile: {
          type: "string",
          format: "binary",
          description: "profile file",
        },
        note: {
          type: "string",
        },
      },
    });
  });
});
