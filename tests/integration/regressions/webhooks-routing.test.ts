import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe("webhook routing", () => {
  it("routes @webhook operations into the top-level webhooks map for OpenAPI 3.1+", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.1",
    });

    try {
      expect(spec.paths).not.toHaveProperty("/webhooks/payment");
      expect(spec.webhooks?.paymentReceived?.post).toMatchObject({
        operationId: "post-webhooks-payment",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaymentWebhookPayload",
              },
            },
          },
        },
        responses: {
          204: expect.any(Object),
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("preserves generated webhooks for OpenAPI 3.2 output", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths).not.toHaveProperty("/webhooks/payment");
      expect(spec.webhooks?.paymentReceived?.post).toMatchObject({
        operationId: "post-webhooks-payment",
        responses: {
          204: expect.any(Object),
        },
      });
    } finally {
      project.cleanup();
    }
  });

  it("drops generated webhooks for OpenAPI 3.0 output", () => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: appRouterCoreFixture,
      openapiVersion: "3.0",
    });

    try {
      expect(spec.webhooks).toBeUndefined();
      expect(spec.paths).not.toHaveProperty("/webhooks/payment");
    } finally {
      project.cleanup();
    }
  });
});
