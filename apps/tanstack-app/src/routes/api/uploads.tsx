import { createFileRoute } from "@tanstack/react-router";

import type { AssetUpload, AssetUploadInput } from "../../schemas/models";

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

function UploadRoute() {
  const instructions = Route.useLoaderData();
  const payload = {
    fileName: "q1-report.pdf",
    kind: "report",
  } satisfies AssetUploadInput;

  return (
    <main>
      <h1>Uploads</h1>
      <pre>{JSON.stringify({ instructions, payload }, null, 2)}</pre>
    </main>
  );
}
