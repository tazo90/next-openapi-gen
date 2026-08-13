import { describe, expect, it } from "vitest";

import { finalizeArazzoDocument } from "@workspace/openapi-arazzo";
import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

const document = {
  arazzo: "1.1.0",
  $self: "https://example.com/arazzo.yaml",
  info: { title: "Purchase", version: "1.0.0" },
  sourceDescriptions: [{ name: "openapi", type: "openapi" as const, url: "./openapi.json" }],
  workflows: [
    {
      workflowId: "purchaseOrder",
      parameters: [{ name: "filter", in: "querystring" as const, value: "$inputs.filter" }],
      steps: [
        {
          stepId: "create",
          operationId: "createOrder",
          dependsOn: ["list"],
          timeout: "30s",
          successCriteria: [
            {
              condition: "$statusCode == 200",
              type: { type: "jsonpath", expression: "$statusCode" },
            },
          ],
        },
      ],
    },
  ],
};

describe("Arazzo version processor", () => {
  it("keeps 1.1 fields including $self, querystring, and selector objects", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = finalizeArazzoDocument(document, "1.1.0", diagnostics);

    expect(finalized.$self).toBe("https://example.com/arazzo.yaml");
    expect(finalized.workflows[0]?.parameters?.[0]?.in).toBe("querystring");
    expect(finalized.workflows[0]?.steps[0]).toMatchObject({
      dependsOn: ["list"],
      timeout: "30s",
      successCriteria: [
        {
          condition: "$statusCode == 200",
          type: { type: "jsonpath", expression: "$statusCode" },
        },
      ],
    });
    expect(diagnostics.getAll()).toEqual([]);
  });

  it("strips 1.1-only fields for Arazzo 1.0", () => {
    const diagnostics = new DiagnosticsCollector();
    const finalized = finalizeArazzoDocument(
      document,
      "1.0.0",
      diagnostics,
      "arazzo/purchase.yaml",
    );

    expect(finalized.arazzo).toBe("1.0.0");
    expect(finalized).not.toHaveProperty("$self");
    expect(finalized.workflows[0]?.parameters?.[0]?.in).toBe("query");
    expect(finalized.workflows[0]?.steps[0]).not.toHaveProperty("dependsOn");
    expect(finalized.workflows[0]?.steps[0]).not.toHaveProperty("timeout");
    expect(finalized.workflows[0]?.steps[0]?.successCriteria?.[0]).not.toHaveProperty("type");
    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({
        code: "ARAZZO_SELF_UNSUPPORTED",
        severity: "warning",
      }),
    ]);
  });
});
