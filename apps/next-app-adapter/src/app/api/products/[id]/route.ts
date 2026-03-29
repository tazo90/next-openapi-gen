import { NextResponse } from "next/server";

import type { CatalogItem, CatalogItemIdParams, UpdateCatalogItemInput } from "@/schemas/catalog";

type ProductRouteContext = {
  params: Promise<CatalogItemIdParams>;
};

/**
 * Get catalog item by ID.
 * @description Demonstrates generation triggered by the Next adapter build hook.
 * @pathParams CatalogItemIdParams
 * @response CatalogItem
 * @tag Catalog
 * @openapi
 */
export async function GET(_request: Request, { params }: ProductRouteContext) {
  const { id } = await params;

  return NextResponse.json({
    id,
    name: "Adapter-powered product",
    status: "active",
  } satisfies CatalogItem);
}

/**
 * Update catalog item by ID.
 * @description Demonstrates typed request and response models with the Next adapter build hook.
 * @pathParams CatalogItemIdParams
 * @body UpdateCatalogItemInput
 * @response CatalogItem
 * @tag Catalog
 * @openapi
 */
export async function PATCH(request: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  const body = (await request.json()) as UpdateCatalogItemInput;

  return NextResponse.json({
    id,
    name: body.name ?? "Adapter-powered product",
    status: body.status ?? "active",
  } satisfies CatalogItem);
}
