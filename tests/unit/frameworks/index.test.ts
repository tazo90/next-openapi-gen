import { describe, expect, it, vi } from "vitest";

const { createNextFrameworkAdapter } = vi.hoisted(() => ({
  createNextFrameworkAdapter: vi.fn(() => ({ name: "next-adapter" })),
}));

vi.mock("@next-openapi-gen/frameworks/next/adapter.js", () => ({
  createNextFrameworkAdapter,
}));

import { createFrameworkAdapter } from "@next-openapi-gen/frameworks/index.js";

describe("createFrameworkAdapter", () => {
  it("delegates next configs to the Next adapter", () => {
    const config = {
      framework: {
        kind: "next",
        router: "app",
      },
    };

    expect(createFrameworkAdapter(config as never)).toEqual({ name: "next-adapter" });
    expect(createNextFrameworkAdapter).toHaveBeenCalledWith(config);
  });

  it("throws for the unimplemented tanstack adapter", () => {
    expect(() =>
      createFrameworkAdapter({
        framework: {
          kind: "tanstack",
        },
      } as never),
    ).toThrow("TanStack framework support is not implemented yet.");
  });
});
