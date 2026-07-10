import type { OpenApiSchema } from "../../shared/types.js";

/**
 * Wrap a schema as nullable. Uses `anyOf` when the base is a `$ref` composition (`allOf`),
 * otherwise sets `nullable: true` on inline schemas.
 */
export function applyNullableWrapper(schema: OpenApiSchema): OpenApiSchema {
  if (schema.$ref) {
    return {
      anyOf: [{ $ref: schema.$ref }, { type: "null" }],
    };
  }
  if (schema.allOf) {
    return { anyOf: [...schema.allOf, { type: "null" }] };
  }
  return { ...schema, nullable: true };
}

/**
 * Apply nullable semantics to a named schema reference, preserving the `$ref` branch.
 */
export function applyNullableToRef(ref: string): OpenApiSchema {
  return {
    anyOf: [{ $ref: ref }, { type: "null" }],
  };
}
