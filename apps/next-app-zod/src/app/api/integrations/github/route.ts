import { NextResponse } from "next/server";

/**
 * List linked GitHub repositories
 * @summary GitHub repositories
 * @description Returns repositories visible to the authorized GitHub OAuth app.
 * @tag Integrations
 * @security OAuth2Auth:repo,user
 * @response 200
 * @responseDescription Linked repositories
 * @operationId zodListGithubRepos
 * @openapi
 */
export async function GET() {
  return NextResponse.json([]);
}
