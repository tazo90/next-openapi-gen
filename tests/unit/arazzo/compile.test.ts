import { describe, expect, it } from "vitest";

import { compileArazzoDescription } from "@workspace/openapi-arazzo";
import { buildGenerationIR } from "@workspace/openapi-core/core/generation-ir.js";
import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

const ir = buildGenerationIR({
  openapi: "3.2.0",
  info: { title: "Fixture", version: "1.0.0" },
  paths: {
    "/orders": {
      get: { operationId: "getOrdersList", responses: { "200": { description: "OK" } } },
      post: { operationId: "createOrder", responses: { "200": { description: "OK" } } },
    },
  },
});

describe("Arazzo compile", () => {
  it("accepts known operationIds and records asyncapi sources without generating AsyncAPI", () => {
    const diagnostics = new DiagnosticsCollector();
    const compiled = compileArazzoDescription(
      {
        arazzo: "1.1.0",
        info: { title: "Purchase", version: "1.0.0" },
        sourceDescriptions: [
          { name: "openapi", type: "openapi", url: "./openapi.json" },
          { name: "events", type: "asyncapi", url: "./asyncapi.yaml" },
        ],
        workflows: [
          {
            workflowId: "purchaseOrder",
            steps: [{ stepId: "list", operationId: "getOrdersList" }],
          },
        ],
      },
      ir,
      diagnostics,
    );

    expect(compiled.workflows[0]?.steps[0]?.operationId).toBe("getOrdersList");
    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({
        code: "ARAZZO_ASYNCAPI_SOURCE",
        severity: "info",
      }),
    ]);
  });

  it("leaves steps without operationId unchanged and accepts a file path", () => {
    const diagnostics = new DiagnosticsCollector();
    const compiled = compileArazzoDescription(
      {
        arazzo: "1.1.0",
        info: { title: "Purchase", version: "1.0.0" },
        sourceDescriptions: [{ name: "openapi", type: "openapi", url: "./openapi.json" }],
        workflows: [
          {
            workflowId: "purchaseOrder",
            steps: [{ stepId: "wait" }],
          },
        ],
      },
      ir,
      diagnostics,
      "workflows/purchase.arazzo.yaml",
    );

    expect(compiled.workflows[0]?.steps[0]).toEqual({ stepId: "wait" });
    expect(diagnostics.getAll()).toEqual([]);
  });

  it("reports unknown operationIds", () => {
    const diagnostics = new DiagnosticsCollector();
    compileArazzoDescription(
      {
        arazzo: "1.0.0",
        info: { title: "Purchase", version: "1.0.0" },
        sourceDescriptions: [],
        workflows: [
          {
            workflowId: "purchaseOrder",
            steps: [{ stepId: "missing", operationId: "noSuchOperation" }],
          },
        ],
      },
      ir,
      diagnostics,
    );

    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({
        code: "ARAZZO_UNKNOWN_OPERATION_ID",
        severity: "error",
        metadata: expect.objectContaining({ operationId: "noSuchOperation" }),
      }),
    ]);
  });
});
