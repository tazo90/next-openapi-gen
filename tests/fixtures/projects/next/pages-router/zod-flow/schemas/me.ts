import { z } from "zod/v4";

export const CurrentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  homepage: z.url().optional(),
});
