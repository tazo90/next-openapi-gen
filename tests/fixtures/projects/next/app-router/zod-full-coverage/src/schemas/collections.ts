import { z } from "zod/v4";

export const CollectionsSchema = z.object({
  list: z.array(z.string()),
  bounded: z.array(z.number()).min(1).max(5),
  nonempty: z.array(z.string()).nonempty(),
  lengthExact: z.array(z.boolean()).length(3),
  set: z.set(z.string()),
  map: z.map(z.string(), z.number()),
});
