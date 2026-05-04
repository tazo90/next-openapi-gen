import type { z } from "zod";
import type { apiErrorIssueSchema, apiErrorSchema } from "./schemas/apiErrorSchema";

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorIssue = z.infer<typeof apiErrorIssueSchema>;
