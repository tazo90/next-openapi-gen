import { getRouteApi } from "@tanstack/react-router";

import type { AssetUploadInput } from "../schemas/models";

const uploadsRoute = getRouteApi("/api/uploads");

const payload = {
  fileName: "q1-report.pdf",
  kind: "report",
} satisfies AssetUploadInput;

export function UploadRoute() {
  const instructions = uploadsRoute.useLoaderData();

  return (
    <main>
      <h1>Uploads</h1>
      <pre>{JSON.stringify({ instructions, payload }, null, 2)}</pre>
    </main>
  );
}
