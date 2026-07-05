import { z } from "zod";

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().int().positive().optional(),
});

export const SearchRequestBodySchema = z.object({
  query: z.string().min(1),
  facets: z.array(z.string()).optional(),
});

/**
 * Search API with HTTP QUERY semantics
 * @summary Query search index
 * @method QUERY
 * @response ProductListResponse
 * @openapi
 */
export async function GET(request: Request) {
  SearchQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  return Response.json({ results: [] });
}

/**
 * Search API with JSON body semantics
 * @summary Search with a JSON body
 * @response ProductListResponse
 * @openapi
 */
export async function POST(request: Request) {
  SearchRequestBodySchema.parse(await request.json());
  return Response.json({ results: [] });
}
