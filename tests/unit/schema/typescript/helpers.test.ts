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
    property.trailingComments = [{ type: "CommentLine", value: " display name" }] as never;

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
