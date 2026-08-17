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

  it("updates array items, deletes null merge-patch keys, and replaces primitives", () => {
    const document = applyOverlay(
      {
        tags: [{ name: "orders" }, { name: "internal" }],
        info: { title: "Internal API", version: "1.0.0", contact: { name: "Ops" } },
        servers: ["https://internal.example"],
      },
      {
        overlay: "1.1.0",
        info: { title: "Public overlay", version: "1.0.0" },
        actions: [
          {
            target: "$.tags[1]",
            update: { name: "public" },
          },
          {
            target: "$.tags[0]",
            remove: true,
          },
          {
            target: "$.info",
            update: { contact: { email: "ops@example.com" }, license: { name: "MIT" } },
          },
          {
            target: "$.info.contact",
            update: { email: null, name: "Support" },
          },
          {
            target: "$.servers",
            update: ["https://public.example"],
          },
        ],
      },
    );

    expect(document.tags).toEqual([{ name: "public" }]);
    expect(document.info).toEqual({
      title: "Internal API",
      version: "1.0.0",
      contact: { name: "Support" },
      license: { name: "MIT" },
    });
    expect(document.servers).toEqual(["https://public.example"]);
  });

  it("replaces the document root and ignores unmatched remove targets", () => {
    const document = applyOverlay(
      { openapi: "3.2.0", info: { title: "Internal", version: "1.0.0" } },
      {
        overlay: "1.1.0",
        info: { title: "Public overlay", version: "1.0.0" },
        actions: [
          {
            target: "$",
            update: { openapi: "3.2.0", info: { title: "Public", version: "2.0.0" } },
          },
          {
            target: "$",
            remove: true,
          },
        ],
      },
    );

    expect(document).toEqual({
      openapi: "3.2.0",
      info: { title: "Public", version: "2.0.0" },
    });
  });

  it("copies values and deletes null merge-patch keys", () => {
    const document = applyOverlay(
      {
        openapi: "3.2.0",
        info: { title: "Internal", version: "1.0.0", contact: { name: "Old" } },
        servers: [{ url: "https://internal.example" }],
      },
      {
        overlay: "1.1.0",
        info: { title: "Public overlay", version: "1.0.0" },
        actions: [
          {
            target: "$.servers[0]",
            copy: "$.info",
          },
          {
            target: "$.info",
            update: { contact: null, license: { name: "MIT" } },
          },
          {
            target: "$.missing",
            copy: "$.info",
          },
        ],
      },
    );

    expect(document.info).toEqual({
      title: "Internal",
      version: "1.0.0",
      license: { name: "MIT" },
    });
    expect(document.servers?.[0]).toEqual({
      title: "Internal",
      version: "1.0.0",
      contact: { name: "Old" },
    });
  });

  it("removes array items and object keys by JSONPath", () => {
    const document = applyOverlay(
      {
        openapi: "3.2.0",
        info: { title: "Internal", version: "1.0.0" },
        tags: [{ name: "internal" }, { name: "public" }],
      },
      {
        overlay: "1.1.0",
        info: { title: "Public overlay", version: "1.0.0" },
        actions: [
          { target: "$.tags[0]", remove: true },
          { target: "$.info.title", remove: true },
        ],
      },
    );

    expect(document.tags).toEqual([{ name: "public" }]);
    expect(document.info).toEqual({ version: "1.0.0" });
  });

  it("throws a clear error when a copy source resolves no value", () => {
    expect(() =>
      applyOverlay(
        {
          info: { title: "Internal" },
          target: { title: "Target" },
        },
        {
          overlay: "1.1.0",
          info: { title: "Invalid overlay", version: "1.0.0" },
          actions: [
            {
              target: "$.target",
              copy: "$.missing",
            },
          ],
        },
      ),
    ).toThrow('Overlay copy source "$.missing" resolved no value.');
  });
});
