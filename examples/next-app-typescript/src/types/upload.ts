export type UploadFormData = {
  file: File; // Image file (PNG/JPG, max 5MB)
  description?: string;
  category: string;
};

export type UploadResponse = {
  id: string;
  filename: string;
  size: number;
  type: string; // MIME type
  url: string; // File access URL
  category: string; // File category
  description?: string;
  uploadedAt: string;
};
