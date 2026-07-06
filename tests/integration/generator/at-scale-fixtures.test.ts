import path from "node:path";

import type { OpenApiDocument } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const AT_SCALE_FIXTURES: Array<{ label: string; fixturePath: string }> = [
  {
    label: "next/app-router/core-flow-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "core-flow-at-scale"),
  },
  {
    label: "next/app-router/ts-full-coverage-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "ts-full-coverage-at-scale"),
  },
  {
    label: "next/app-router/zod-full-coverage-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "zod-full-coverage-at-scale"),
  },
  {
    label: "next/app-router/zod-only-coverage-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "zod-only-coverage-at-scale"),
  },
  {
    label: "next/app-router/mixed-schemas-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "mixed-schemas-at-scale"),
  },
  {
    label: "next/app-router/drizzle-zod-flow-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "drizzle-zod-flow-at-scale"),
  },
  {
    label: "next/app-router/ignore-routes-at-scale",
    fixturePath: getProjectFixturePath("next", "app-router", "ignore-routes-at-scale"),
  },
  {
    label: "next/pages-router/core-flow-at-scale",
    fixturePath: getProjectFixturePath("next", "pages-router", "core-flow-at-scale"),
  },
  {
    label: "next/pages-router/zod-flow-at-scale",
    fixturePath: getProjectFixturePath("next", "pages-router", "zod-flow-at-scale"),
  },
  {
    label: "tanstack/core-flow-at-scale",
    fixturePath: getProjectFixturePath("tanstack", "core-flow-at-scale"),
  },
  {
    label: "react-router/core-flow-at-scale",
    fixturePath: getProjectFixturePath("react-router", "core-flow-at-scale"),
  },
];

function countPathOperations(spec: OpenApiDocument): number {
  return Object.values(spec.paths ?? {}).reduce((count, pathItem) => {
    if (!pathItem || typeof pathItem !== "object") {
      return count;
    }
    return (
      count +
      Object.keys(pathItem).filter(
        (key) => !["parameters", "summary", "description", "servers"].includes(key),
      ).length
    );
  }, 0);
}

describe("at-scale fixture generation", () => {
  it.each(AT_SCALE_FIXTURES)("generates a large OpenAPI document for $label", ({ fixturePath }) => {
    const { project, spec, performanceProfile } = generateFixtureSpec({
      fixturePath,
      openapiVersion: "3.2",
    });

    try {
      expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThanOrEqual(45);
      expect(countPathOperations(spec)).toBeGreaterThanOrEqual(
        fixturePath.includes(`${path.sep}tanstack${path.sep}`) ||
          fixturePath.includes(`${path.sep}react-router${path.sep}`)
          ? 95
          : 120,
      );
      expect(Object.keys(spec.components?.schemas ?? {}).length).toBeGreaterThanOrEqual(50);
      expect(performanceProfile?.totalMs).toBeGreaterThan(0);
    } finally {
      project.cleanup();
    }
  });

  it("maps TanStack scale routes with loader/action handlers", () => {
    const fixturePath = getProjectFixturePath("tanstack", "core-flow-at-scale");
    const { project, spec } = generateFixtureSpec({
      fixturePath,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/generated/customers"]?.get).toMatchObject({
        operationId: "tanstackScaleListCustomer",
        tags: ["Customers"],
      });
      expect(spec.paths?.["/generated/customers"]?.post).toMatchObject({
        operationId: "tanstackScaleCreateCustomer",
      });
    } finally {
      project.cleanup();
    }
  });

  it("maps React Router scale routes with loader/action handlers", () => {
    const fixturePath = getProjectFixturePath("react-router", "core-flow-at-scale");
    const { project, spec } = generateFixtureSpec({
      fixturePath,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/generated/products/{id}"]?.get).toMatchObject({
        operationId: "reactRouterScaleGetProduct",
        tags: ["Products"],
      });
      expect(spec.paths?.["/generated/products/{id}"]?.post).toMatchObject({
        operationId: "reactRouterScaleUpdateProduct",
      });
    } finally {
      project.cleanup();
    }
  });

  it("respects ignoreRoutes filtering on the ignore-routes-at-scale fixture", () => {
    const fixturePath = getProjectFixturePath("next", "app-router", "ignore-routes-at-scale");
    const { project, spec } = generateFixtureSpec({
      fixturePath,
      openapiVersion: "3.2",
    });

    try {
      expect(spec.paths?.["/admin/test"]).toBeUndefined();
      expect(spec.paths?.["/generated/customers"]).toBeDefined();
    } finally {
      project.cleanup();
    }
  });
});
