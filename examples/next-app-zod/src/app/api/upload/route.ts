import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { UploadFormDataSchema, UploadResponse } from "@/schemas/upload";

/**
 * Upload image file
 * @description Uploads PNG or JPG image files with validation and metadata
 * @body UploadFormDataSchema
 * @contentType multipart/form-data
 * @bodyDescription Multipart form data containing image file (PNG/JPG, max 5MB), optional description and category
 * @response UploadResponseSchema
 * @responseDescription Returns upload confirmation with file metadata and access URL
 * @tag Uploads
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const data = {
      file: formData.get("file") as File,
      description: (formData.get("description") as string) || undefined,
      category: formData.get("category") as string,
    };

    const validatedData = UploadFormDataSchema.parse(data);

    const response: UploadResponse = {
      id: "upload_" + Date.now(),
      filename: validatedData.file.name,
      size: validatedData.file.size,
      type: validatedData.file.type,
      url: `/uploads/${validatedData.file.name}`,
      category: validatedData.category,
      description: validatedData.description,
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
