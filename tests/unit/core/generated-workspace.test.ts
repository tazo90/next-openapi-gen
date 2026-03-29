import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGeneratedWorkspaceDir } from "@workspace/openapi-core/core/generated-workspace.js";

describe("resolveGeneratedWorkspaceDir", () => {
  it("defaults to the hidden generated workspace directory", () => {
    expect(resolveGeneratedWorkspaceDir()).toBe(path.resolve(process.cwd(), ".next-openapi"));
  });

  it("resolves custom generated workspace directories from cwd", () => {
    expect(resolveGeneratedWorkspaceDir(".openapi-cache")).toBe(
      path.resolve(process.cwd(), ".openapi-cache"),
    );
  });
});
