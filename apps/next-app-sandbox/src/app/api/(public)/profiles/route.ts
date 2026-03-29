import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ProfileFilters = z.object({
  includeHidden: z.boolean().optional().describe("Include hidden profiles"),
  q: z.string().optional().describe("Search term"),
});

const ProfileDraft = z.object({
  avatar: z
    .object({
      url: z.string().url().describe("Avatar URL"),
    })
    .nullable()
    .describe("Nullable avatar"),
  banner: z
    .object({
      url: z.string().url().describe("Banner URL"),
    })
    .nullish()
    .describe("Nullish banner"),
  displayName: z.string().optional().describe("Optional public display name"),
});

/**
 * List public profiles
 * @description Exercises nullable, nullish, and optional permutations from a public route group.
 * @queryParams ProfileFilters
 * @response ProfileDraft[]
 * @tag Profiles
 * @openapi
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json([
    {
      avatar: null,
      banner: undefined,
      displayName: "OpenAPI Explorer",
    },
  ]);
}

/**
 * Create a profile preview
 * @description Mixes query and body metadata in the sandbox app to stress route parsing.
 * @queryParams ProfileFilters
 * @body ProfileDraft
 * @response ProfileDraft
 * @tag Profiles
 * @openapi
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(ProfileDraft.parse(await request.json()), { status: 201 });
}
