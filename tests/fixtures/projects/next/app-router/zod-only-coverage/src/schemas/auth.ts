import { z } from "zod/v4";

import { ProviderSchema, SafeRedirectPathSchema } from "./shared";

export const OAuthStartQuerySchema = z.object({
  next: SafeRedirectPathSchema.optional(),
  provider: ProviderSchema,
});

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  createdAt: z.iso.datetime(),
  lastSignInAt: z.iso.datetime().nullable(),
  website: z.url().optional(),
});

export const LoginResponseSchema = z.object({
  user: AuthUserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
