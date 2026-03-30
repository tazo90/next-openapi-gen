import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Upload an attachment
 * @description Demonstrates multipart-style documentation and auth-heavy Pages Router handlers.
 * @body UploadRequestSchema
 * @contentType multipart/form-data
 * @response 201:UploadResponseSchema
 * @auth bearer
 * @method POST
 * @openapi
 */
/**
 * Download upload instructions
 * @description Returns plain-text upload instructions for Pages Router transport coverage.
 * @response string
 * @responseContentType text/plain
 * @method GET
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    res.setHeader("content-type", "text/plain");
    res.status(200).send("Attach a file part named 'file' plus a purpose field.");
    return;
  }

  if (req.method === "POST") {
    res.status(201).json({
      fileName: "avatar.png",
      id: "upload_123",
      purpose: "avatar",
      url: "https://example.com/uploads/upload_123",
    });
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
