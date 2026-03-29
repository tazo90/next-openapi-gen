import { NextRequest, NextResponse } from "next/server";

import { AuthorIdParams, AuthorResponseSchema, UpdateAuthorSchema } from "@/schemas/author";

/**
 * Get author by ID
 * @description Retrieves a single author with relation-ready response fields.
 * @pathParams AuthorIdParams
 * @response AuthorResponseSchema
 * @tag Authors
 * @openapi
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  AuthorIdParams.parse({ id });

  return NextResponse.json(
    AuthorResponseSchema.parse({
      avatarUrl: "https://example.com/avatars/ada.png",
      bio: "Writes about ORMs and validation",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      email: "ada@example.com",
      id: Number(id),
      name: "Ada Lovelace",
    }),
  );
}

/**
 * Update author by ID
 * @description Updates author profile details using drizzle-zod update schemas.
 * @pathParams AuthorIdParams
 * @body UpdateAuthorSchema
 * @response AuthorResponseSchema
 * @tag Authors
 * @openapi
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdateAuthorSchema.parse(await request.json());
  AuthorIdParams.parse({ id });

  return NextResponse.json(
    AuthorResponseSchema.parse({
      avatarUrl: body.avatarUrl ?? "https://example.com/avatars/ada.png",
      bio: body.bio ?? "Writes about ORMs and validation",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      email: "ada@example.com",
      id: Number(id),
      name: body.name ?? "Ada Lovelace",
    }),
  );
}
