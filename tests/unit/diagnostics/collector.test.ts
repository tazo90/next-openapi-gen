import { describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "@next-openapi-gen/diagnostics/collector.js";

describe("DiagnosticsCollector", () => {
  it("stores diagnostics for later reporting", () => {
    const collector = new DiagnosticsCollector();

    collector.add({
      code: "missing-path-params-type",
      severity: "warning",
      message: "Missing @pathParams type",
      routePath: "/users/{id}",
    });

    expect(collector.hasAny()).toBe(true);
    expect(collector.getAll()).toEqual([
      {
        code: "missing-path-params-type",
        severity: "warning",
        message: "Missing @pathParams type",
        routePath: "/users/{id}",
      },
    ]);
  });
});
