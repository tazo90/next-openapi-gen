import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const SearchQueryParams = z.object({
  q: z.string().describe("Search query"),
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Items per page"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort order"),
});

export const SearchResponse = z.object({
  results: z.array(z.object({
    id: z.string().describe("Result ID"),
    title: z.string().describe("Result title"),
    score: z.number().describe("Relevance score"),
  })).describe("Search results"),
  total: z.number().describe("Total results found"),
});

/**
 * Search endpoint with @queryParams tag
 * @description Test endpoint to verify @queryParams works (to avoid prettier-plugin-jsdoc conflicts)
 * @queryParams SearchQueryParams
 * @response SearchResponse
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    results: [
      {
        id: "result-1",
        title: "Example Result",
        score: 0.95,
      },
    ],
    total: 1,
  });
}
