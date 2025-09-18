import { NextResponse } from "next/server";

/**
 * GET /api/llms
 * @description Get list of available LLMs
 * @response 200:MyApiSuccessResponseBody<LLMSResponse>
 * @openapi
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    httpCode: "200",
    llms: [
      {
        id: "gpt-5",
        name: "GPT-5",
        provider: "OpenAI",
        isDefault: true,
      },
      {
        id: "claude-4",
        name: "Claude 4",
        provider: "Anthropic",
        isDefault: false,
      },
    ],
  });
}
