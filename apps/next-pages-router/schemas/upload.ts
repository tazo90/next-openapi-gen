import { z } from "zod";

export const UploadRequestSchema = z.object({
  fileName: z.string().describe("Uploaded filename"),
  purpose: z.enum(["avatar", "attachment"]).describe("Upload purpose"),
});

export const UploadResponseSchema = z.object({
  id: z.string().describe("Upload identifier"),
  fileName: z.string().describe("Stored filename"),
  purpose: z.enum(["avatar", "attachment"]).describe("Upload purpose"),
  url: z.string().url().describe("Public download URL"),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;
