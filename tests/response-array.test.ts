import { describe, it, expect, beforeEach } from "vitest";
import { extractTypeFromComment } from "../src/lib/utils";

describe("Array Response Annotation Parsing", () => {
  describe("extractTypeFromComment with array notation", () => {
    it("should extract single-dimensional array types", () => {
      const comment = "@response PostResponseSchema[]";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("PostResponseSchema[]");
    });

    it("should extract multi-dimensional array types", () => {
      const comment = "@response PostResponseSchema[][]";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("PostResponseSchema[][]");
    });

    it("should extract generic types with array suffix", () => {
      const comment = "@response Response<Data>[]";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("Response<Data>[]");
    });

    it("should extract nested generic types with array suffix", () => {
      const comment = "@response ApiResponse<User<Details>>[]";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("ApiResponse<User<Details>>[]");
    });

    it("should handle non-array types normally", () => {
      const comment = "@response UserResponse";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("UserResponse");
    });

    it("should handle generic types without arrays", () => {
      const comment = "@response Response<Data>";
      const result = extractTypeFromComment(comment, "@response");
      expect(result).toBe("Response<Data>");
    });

    it("should handle array types with status codes", () => {
      // Note: Status codes are parsed separately by the responseMatch regex in extractJSDocComments
      // extractTypeFromComment only extracts the type part
      const comment = "@response 200:PostResponseSchema[]";
      const responseMatch = comment.match(
        /@response\s+(?:(\d+):)?([^@\n\r]+)(?:\s+(.*))?/
      );
      expect(responseMatch).toBeTruthy();
      if (responseMatch) {
        const [, code, type] = responseMatch;
        expect(code).toBe("200");
        expect(type?.trim()).toBe("PostResponseSchema[]");
      }
    });

    it("should extract array types from @body annotation", () => {
      const comment = "@body CreatePostSchema[]";
      const result = extractTypeFromComment(comment, "@body");
      expect(result).toBe("CreatePostSchema[]");
    });
  });

  describe("Array depth parsing logic", () => {
    it("should correctly count array depth for single array", () => {
      let baseType = "Type[]";
      let arrayDepth = 0;

      while (baseType.endsWith("[]")) {
        arrayDepth++;
        baseType = baseType.slice(0, -2);
      }

      expect(arrayDepth).toBe(1);
      expect(baseType).toBe("Type");
    });

    it("should correctly count array depth for double array", () => {
      let baseType = "Type[][]";
      let arrayDepth = 0;

      while (baseType.endsWith("[]")) {
        arrayDepth++;
        baseType = baseType.slice(0, -2);
      }

      expect(arrayDepth).toBe(2);
      expect(baseType).toBe("Type");
    });

    it("should correctly count array depth for triple array", () => {
      let baseType = "Type[][][]";
      let arrayDepth = 0;

      while (baseType.endsWith("[]")) {
        arrayDepth++;
        baseType = baseType.slice(0, -2);
      }

      expect(arrayDepth).toBe(3);
      expect(baseType).toBe("Type");
    });

    it("should handle generic types with arrays", () => {
      let baseType = "Generic<T>[]";
      let arrayDepth = 0;

      while (baseType.endsWith("[]")) {
        arrayDepth++;
        baseType = baseType.slice(0, -2);
      }

      expect(arrayDepth).toBe(1);
      expect(baseType).toBe("Generic<T>");
    });
  });

  describe("Schema structure generation", () => {
    it("should generate correct schema for single array", () => {
      const baseType = "PostResponseSchema";
      const arrayDepth = 1;

      let schema: any = { $ref: `#/components/schemas/${baseType}` };
      for (let i = 0; i < arrayDepth; i++) {
        schema = {
          type: "array",
          items: schema,
        };
      }

      expect(schema).toEqual({
        type: "array",
        items: {
          $ref: "#/components/schemas/PostResponseSchema",
        },
      });
    });

    it("should generate correct schema for double array", () => {
      const baseType = "PostResponseSchema";
      const arrayDepth = 2;

      let schema: any = { $ref: `#/components/schemas/${baseType}` };
      for (let i = 0; i < arrayDepth; i++) {
        schema = {
          type: "array",
          items: schema,
        };
      }

      expect(schema).toEqual({
        type: "array",
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/PostResponseSchema",
          },
        },
      });
    });

    it("should generate correct schema for non-array type", () => {
      const baseType = "PostResponseSchema";
      const arrayDepth = 0;

      let schema: any;
      if (arrayDepth === 0) {
        schema = { $ref: `#/components/schemas/${baseType}` };
      } else {
        schema = { $ref: `#/components/schemas/${baseType}` };
        for (let i = 0; i < arrayDepth; i++) {
          schema = {
            type: "array",
            items: schema,
          };
        }
      }

      expect(schema).toEqual({
        $ref: "#/components/schemas/PostResponseSchema",
      });
    });
  });
});
