import { describe, expect, it } from "vitest";

import { applyOverlay } from "@workspace/openapi-overlay";

describe("overlay apply", () => {
  it("applies sequential update, copy, and remove actions", () => {
    const document = applyOverlay(
      {
        openapi: "3.2.0",
        info: { title: "Internal API", version: "1.0.0" },
        paths: {
          "/orders": { get: { operationId: "getOrdersList" } },
          "/webhooks/payment": { post: { operationId: "zodReceivePaymentEvent" } },
          "/internal/copy-target": { get: { operationId: "internalCopy" } },
        },
      },
      {
        overlay: "1.1.0",
        info: { title: "Public overlay", version: "1.0.0" },
        actions: [
          {
            target: "$.info",
            update: { title: "Public API" },
          },
          {
            target: "$.paths['/internal/copy-target']",
            copy: "$.paths['/orders']",
          },
          {
            target: "$.paths['/webhooks/payment']",
            remove: true,
          },
        ],
      },
    );

    expect(document.info.title).toBe("Public API");
    expect(document.paths).not.toHaveProperty("/webhooks/payment");
    expect(document.paths["/internal/copy-target"]).toEqual({
      get: { operationId: "getOrdersList" },
    });
  });
});
