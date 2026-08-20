import { createFileRoute } from "@tanstack/react-router";

import { UploadRoute } from "../../pages/uploads";
import type { AssetUpload } from "../../schemas/models";

/**
 * Load upload instructions.
 * @operationId tanstackGetUploadInstructions
 * @response string
 * @responseContentType text/plain
 * @tag Uploads
 * @responseSet common
 * @openapi
 */
export async function loader() {
  return "POST multipart form data with fileName and kind.";
}

/**
 * Create an upload record.
 * @operationId tanstackCreateUpload
 * @body AssetUploadInput
 * @contentType multipart/form-data
 * @response AssetUpload
 * @tag Uploads
 * @auth bearer
 * @responseSet auth
 * @openapi
 */
export async function action() {
  return {
    id: "asset_123",
    kind: "report",
    url: "https://example.com/uploads/asset_123",
  } satisfies AssetUpload;
}

export const Route = createFileRoute("/api/uploads")({
  component: UploadRoute,
  loader,
});
