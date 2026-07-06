import { z } from "zod/v4";

export const ColorEnum = z.enum(["red", "green", "blue"]);

export const StringOrNumber = z.union([z.string(), z.number()]);

export const Cat = z.object({ kind: z.literal("cat"), meow: z.boolean() });
export const Dog = z.object({ kind: z.literal("dog"), bark: z.boolean() });
export const Pet = z.discriminatedUnion("kind", [Cat, Dog]);

export const NullableScalar = z.string().nullable();
export const NullishScalar = z.string().nullish();
export const OptionalScalar = z.string().optional();
export const WithDefault = z.string().default("anon");
export const ReadonlyField = z.string().readonly();

export const Branded = z.string().brand<"UserId">();
export const Described = z.number().describe("A score between 0 and 100");
