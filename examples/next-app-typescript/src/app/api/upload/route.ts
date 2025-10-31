import { NextRequest, NextResponse } from "next/server";

import { UploadResponse } from "@/types/upload";

/**
 * Upload image file
 * @description Uploads PNG or JPG image files with validation and metadata
 * @body UploadFormData
 * @contentType multipart/form-data
 * @bodyDescription Multipart form data containing image file (PNG/JPG, max 5MB), optional description and category
 * @response UploadResponse
 * @responseDescription Returns upload confirmation with file metadata and access URL
 * @tag Uploads
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string | null;
    const category = formData.get("category") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json(
        { error: "Category is required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    // Here you would typically:
    // 1. Save file to storage (S3, local filesystem, etc.)
    // 2. Generate unique ID and URL
    // 3. Save metadata to database

    const response: UploadResponse = {
      id: "upload_" + Date.now(),
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/uploads/${file.name}`, // Example URL
      category,
      description: description || undefined,
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
