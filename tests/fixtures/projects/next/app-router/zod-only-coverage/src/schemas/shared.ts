import { z } from "zod/v4";

export const ProviderSchema = z.enum(["github", "google"]);

export const SafeRedirectPathSchema = z
  .string()
  .trim()
  .transform((value) => value || "/")
  .refine((value) => value.startsWith("/") && !value.startsWith("//"))
  .refine((value) => !value.includes("://"))
  .brand<"SafeRedirectPath">();
