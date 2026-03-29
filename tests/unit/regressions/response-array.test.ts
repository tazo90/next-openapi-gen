import { describe, expect, it } from "vitest";

import { extractTypeFromComment } from "@workspace/openapi-core/shared/utils.js";

describe("Array response annotation parsing", () => {
  it("extracts array and generic response/body types from comments", () => {
    expect(extractTypeFromComment("@response PostResponseSchema[]", "@response")).toBe(
      "PostResponseSchema[]",
    );
    expect(extractTypeFromComment("@response ApiResponse<User<Details>>[]", "@response")).toBe(
      "ApiResponse<User<Details>>[]",
    );
    expect(extractTypeFromComment("@body CreatePostSchema[]", "@body")).toBe("CreatePostSchema[]");
  });

  it("preserves the response type when status codes are present", () => {
    const responseMatch = "@response 200:PostResponseSchema[]".match(
      /@response\s+(?:(\d+):)?([^@\n\r]+)(?:\s+(.*))?/,
    );

    expect(responseMatch).toBeTruthy();
    if (responseMatch) {
      const [, code, type] = responseMatch;
      expect(code).toBe("200");
      expect(type?.trim()).toBe("PostResponseSchema[]");
    }
  });

  it("builds nested array schemas correctly", () => {
    const buildSchema = (typeName: string) => {
      let baseType = typeName;
      let arrayDepth = 0;

      while (baseType.endsWith("[]")) {
        arrayDepth++;
        baseType = baseType.slice(0, -2);
      }

      let schema: Record<string, unknown> = { $ref: `#/components/schemas/${baseType}` };
      for (let index = 0; index < arrayDepth; index++) {
        schema = {
          type: "array",
          items: schema,
        };
      }

      return schema;
    };

    expect(buildSchema("PostResponseSchema[]")).toEqual({
      type: "array",
      items: {
        $ref: "#/components/schemas/PostResponseSchema",
      },
    });
    expect(buildSchema("PostResponseSchema[][]")).toEqual({
      type: "array",
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/PostResponseSchema",
        },
      },
    });
  });
});
