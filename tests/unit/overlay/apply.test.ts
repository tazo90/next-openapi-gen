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

  it("applies reusable actions from components.actions", () => {
    const document = applyOverlay(
      {
        openapi: "3.2.0",
        info: { title: "Example API", version: "1.0.0" },
        paths: {
          "/items": { get: { responses: { "200": { description: "OK" } } } },
          "/some-items": { delete: { responses: { "200": { description: "OK" } } } },
        },
      },
      {
        overlay: "1.2.0",
        info: { title: "Use reusable actions to insert error responses", version: "1.0.0" },
        components: {
          actions: {
            errorResponse: {
              description: "Adds an error response to the operation",
              fields: {
                update: {
                  "404": {
                    description: "Not Found",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { message: { type: "string" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        actions: [
          { $ref: "#/components/actions/errorResponse", target: "$.paths['/items'].get.responses" },
          {
            $ref: "#/components/actions/errorResponse",
            target: "$.paths['/some-items'].delete.responses",
          },
        ],
      },
    );

    expect(document.paths["/items"].get.responses).toMatchObject({
      "200": { description: "OK" },
      "404": { description: "Not Found" },
    });
    expect(document.paths["/some-items"].delete.responses).toMatchObject({
      "200": { description: "OK" },
      "404": { description: "Not Found" },
    });
  });

  it("decodes RFC 6901 component action keys", () => {
    const document = applyOverlay(
      { info: { title: "Internal", contact: { name: "Ops" } } },
      {
        overlay: "1.2.0",
        info: { title: "Encoded key", version: "1.0.0" },
        components: {
          actions: {
            "error/response": {
              fields: { update: { title: "Public" } },
            },
            "tilde~key": {
              fields: { update: { name: "Support" } },
            },
          },
        },
        actions: [
          { $ref: "#/components/actions/error~1response", target: "$.info" },
          { $ref: "#/components/actions/tilde~0key", target: "$.info.contact" },
        ],
      },
    );

    expect(document.info.title).toBe("Public");
    expect(document.info.contact).toEqual({ name: "Support" });
  });

  it("lets reusable action references override description, update, copy, and remove", () => {
    const document = applyOverlay(
      {
        info: { title: "Internal", description: "Keep" },
        source: { title: "Copied" },
        drop: { title: "Gone" },
      },
      {
        overlay: "1.2.0",
        info: { title: "Overrides", version: "1.0.0" },
        components: {
          actions: {
            updateTitle: {
              fields: {
                description: "Reusable description",
                update: { title: "From reusable" },
              },
            },
            copySource: { fields: {} },
            removeDrop: { fields: {} },
          },
        },
        actions: [
          {
            $ref: "#/components/actions/updateTitle",
            target: "$.info",
            description: "Reference description",
            update: { title: "From reference" },
          },
          {
            $ref: "#/components/actions/copySource",
            target: "$.info",
            copy: "$.source",
          },
          {
            $ref: "#/components/actions/removeDrop",
            target: "$.drop",
            remove: true,
          },
        ],
      },
    );

    expect(document.info).toEqual({ title: "Copied" });
    expect(document).not.toHaveProperty("drop");
  });

  it("applies reusable actions that omit fields", () => {
    const document = applyOverlay(
      { info: { title: "Internal" } },
      {
        overlay: "1.2.0",
        info: { title: "Empty fields", version: "1.0.0" },
        components: {
          actions: {
            noop: {},
          },
        },
        actions: [{ $ref: "#/components/actions/noop", target: "$.info" }],
      },
    );

    expect(document.info.title).toBe("Internal");
  });

  it("throws when a reusable action defines fields.target", () => {
    expect(() =>
      applyOverlay(
        { info: { title: "Internal" } },
        {
          overlay: "1.2.0",
          info: { title: "Invalid", version: "1.0.0" },
          components: {
            actions: {
              invalid: { fields: { target: "$.info", update: { title: "Public" } } },
            },
          },
          actions: [{ $ref: "#/components/actions/invalid", target: "$.info" }],
        },
      ),
    ).toThrow('Overlay reusable action "invalid" must not define fields.target.');
  });

  it("throws when a reusable action $ref is missing or external", () => {
    expect(() =>
      applyOverlay(
        { info: { title: "Internal" } },
        {
          overlay: "1.2.0",
          info: { title: "Missing", version: "1.0.0" },
          actions: [{ $ref: "#/components/actions/missing", target: "$.info" }],
        },
      ),
    ).toThrow('Overlay reusable action ref "#/components/actions/missing" resolved no value.');

    expect(() =>
      applyOverlay(
        { info: { title: "Internal" } },
        {
          overlay: "1.2.0",
          info: { title: "External", version: "1.0.0" },
          actions: [{ $ref: "./shared.yaml#/components/actions/error", target: "$.info" }],
        },
      ),
    ).toThrow(
      'Overlay reusable action ref "./shared.yaml#/components/actions/error" is not a same-document "#/components/actions/..." pointer.',
    );

    expect(() =>
      applyOverlay(
        { info: { title: "Internal" } },
        {
          overlay: "1.2.0",
          info: { title: "Nested pointer", version: "1.0.0" },
          actions: [{ $ref: "#/components/actions/error/response", target: "$.info" }],
        },
      ),
    ).toThrow(
      'Overlay reusable action ref "#/components/actions/error/response" is not a same-document "#/components/actions/..." pointer.',
    );

    expect(() =>
      applyOverlay(
        { info: { title: "Internal" } },
        {
          overlay: "1.2.0",
          info: { title: "Empty pointer", version: "1.0.0" },
          actions: [{ $ref: "#/components/actions/", target: "$.info" }],
        },
      ),
    ).toThrow(
      'Overlay reusable action ref "#/components/actions/" is not a same-document "#/components/actions/..." pointer.',
    );
  });

  it("applies overlays to AsyncAPI documents", () => {
    const document = applyOverlay(
      {
        asyncapi: "3.0.0",
        info: { title: "Events", version: "1.0.0" },
        channels: {
          userSignedUp: { address: "user/signed-up" },
          orderPlaced: { address: "order/placed" },
        },
      },
      {
        overlay: "1.2.0",
        info: { title: "Mark channels internal", version: "1.0.0" },
        targetFormat: "asyncapi",
        actions: [{ target: "$.channels.*", update: { "x-internal": true } }],
      },
    );

    expect(document.channels.userSignedUp).toMatchObject({ "x-internal": true });
    expect(document.channels.orderPlaced).toMatchObject({ "x-internal": true });
  });
});
