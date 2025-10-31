import { z } from "zod";

export const UploadFormDataSchema = z.object({
  file: z
    .custom<File>()
    .refine((file) => file instanceof File, "Must be a file")
    .refine(
      (file) => file.size <= 5 * 1024 * 1024,
      "File size must be less than 5MB"
    )
    .refine(
      (file) => file.type.startsWith("image/"),
      "Only image files allowed"
    )
    .describe("Image file (PNG/JPG, max 5MB)"),
  description: z.string().optional().describe("Optional file description"),
  category: z.string().min(1).describe("File category (required)"),
});

export const UploadResponseSchema = z.object({
  id: z.string().describe("Upload ID"),
  filename: z.string().describe("Original filename"),
  size: z.number().describe("File size in bytes"),
  type: z.string().describe("MIME type"),
  url: z.string().url().describe("File access URL"),
  category: z.string().describe("File category"),
  description: z.string().optional().describe("File description"),
  uploadedAt: z.string().datetime().describe("Upload timestamp"),
});

// TypeScript types z Zod
export type UploadFormData = z.infer<typeof UploadFormDataSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
