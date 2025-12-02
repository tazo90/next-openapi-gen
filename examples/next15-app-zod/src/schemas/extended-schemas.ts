import { z } from "zod";

/**
 * Base schema for testing .extend() functionality
 */
export const BaseSchema = z.object({
  id: z.string().uuid().describe("Identifier"),
});

/**
 * Extended schema that adds properties to BaseSchema
 */
export const ExtendedSchema = BaseSchema.extend({
  name: z.string().describe("Name"),
});

/**
 * Schema with nested reference to test $ref generation
 */
export const NestedSchema = z.object({
  foo: BaseSchema,
  bar: z.string(),
});

/**
 * Multiple levels of extension to test deep inheritance
 */
export const DoubleExtendedSchema = ExtendedSchema.extend({
  email: z.string().email().describe("Email address"),
  age: z.number().int().positive().optional().describe("Age in years"),
});
