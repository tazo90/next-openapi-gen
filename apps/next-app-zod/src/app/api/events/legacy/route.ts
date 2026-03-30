import { legacyEventExamples } from "@/schemas/event";

/**
 * Download legacy event export
 * @description Deprecated CSV export kept to demonstrate migration guidance and versioned tags.
 * @tag Events v1
 * @tagSummary Legacy exports
 * @tagKind maintenance
 * @tagParent Platform
 * @response LegacyEventCsv
 * @responseContentType text/csv
 * @examples response:legacyEventExamples
 * @deprecated
 * @operationId zodDownloadLegacyEvents
 * @openapi
 */
export async function GET() {
  return new Response(
    "id,product,status,sequence,emittedAt\nevt_001,catalog,active,17,2026-03-29T12:00:00.000Z\n",
    {
      headers: {
        "content-disposition": 'attachment; filename="legacy-events.csv"',
        "content-type": "text/csv",
      },
      status: 200,
    },
  );
}
