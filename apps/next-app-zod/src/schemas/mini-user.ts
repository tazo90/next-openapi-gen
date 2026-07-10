import { z } from "zod/mini";

const MiniUserBaseSchema = z.object({
  id: z.string().check(z.uuid()),
  email: z.string().check(z.email()),
});

/** Zod Mini sample: functional extend + check refinements. */
export const MiniUserSchema = z.extend(MiniUserBaseSchema, {
  displayName: z.optional(z.string().check(z.minLength(1), z.maxLength(100))),
  bio: z.nullable(z.string().check(z.maxLength(280))),
});

export type MiniUser = z.infer<typeof MiniUserSchema>;
