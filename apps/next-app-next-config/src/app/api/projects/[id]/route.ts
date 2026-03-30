import { NextResponse } from "next/server";

import type {
  ProjectRecord,
  ProjectRecordIdParams,
  UpdateProjectRecordInput,
} from "@/schemas/project";

type ProjectRouteContext = {
  params: Promise<ProjectRecordIdParams>;
};

/**
 * Get project by ID.
 * @description Demonstrates using next.config.ts to point the adapter at a typed config file.
 * @pathParams ProjectRecordIdParams
 * @response ProjectRecord
 * @tag Projects
 * @openapi
 */
export async function GET(_request: Request, { params }: ProjectRouteContext) {
  const { id } = await params;

  return NextResponse.json({
    id,
    name: "Config-driven project",
    visibility: "private",
  } satisfies ProjectRecord);
}

/**
 * Update project by ID.
 * @description Demonstrates request and response typing through the next.config.ts integration path.
 * @pathParams ProjectRecordIdParams
 * @body UpdateProjectRecordInput
 * @response ProjectRecord
 * @tag Projects
 * @openapi
 */
export async function PATCH(request: Request, { params }: ProjectRouteContext) {
  const { id } = await params;
  const body = (await request.json()) as UpdateProjectRecordInput;

  return NextResponse.json({
    id,
    name: body.name ?? "Config-driven project",
    visibility: body.visibility ?? "private",
  } satisfies ProjectRecord);
}
