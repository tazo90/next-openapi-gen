import { z } from "zod";

export const apiErrorIssueSchema = z.object({
  path: z.array(z.string()),
  message: z.string(),
  code: z.string().optional(),
});

export const apiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  issues: z.array(apiErrorIssueSchema).optional(),
});
