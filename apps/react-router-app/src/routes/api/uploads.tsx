import type { UploadArtifact, UploadDraft } from "../../schemas/models";

/**
 * Load upload instructions.
 * @operationId reactRouterGetUploadInstructions
 * @response string
 * @responseContentType text/plain
 * @tag Uploads
 * @responseSet common
 * @openapi
 */
export async function loader() {
  return "POST multipart form data with fileName and folder.";
}

/**
 * Create an upload artifact.
 * @operationId reactRouterCreateUpload
 * @body UploadDraft
 * @contentType multipart/form-data
 * @response UploadArtifact
 * @tag Uploads
 * @auth bearer
 * @responseSet auth
 * @openapi
 */
export async function action() {
  return {
    folder: "exports",
    id: "upload_456",
    url: "https://example.com/uploads/upload_456",
  } satisfies UploadArtifact;
}

export default function UploadRoute() {
  const payload = {
    fileName: "avatar.png",
    folder: "avatars",
  } satisfies UploadDraft;

  return (
    <main>
      <h1>Uploads</h1>
      <pre>{JSON.stringify({ payload }, null, 2)}</pre>
    </main>
  );
}
