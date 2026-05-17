import { describe, expect, it } from "vitest";

import {
  applyExcludeSchemas,
  matchExcludePatterns,
} from "@workspace/openapi-core/core/exclude-schemas.js";
import type { OpenApiDocument } from "@workspace/openapi-core/shared/types.js";

describe("matchExcludePatterns", () => {
  it("returns empty array when no patterns provided", () => {
    expect(matchExcludePatterns(["Foo", "Bar"], [])).toEqual([]);
  });

  it("matches exact names", () => {
    expect(matchExcludePatterns(["Foo", "Bar", "Baz"], ["Bar"])).toEqual(["Bar"]);
  });

  it("matches wildcard suffix pattern", () => {
    const result = matchExcludePatterns(
      ["ProductIdParams", "ProductBulkSchema", "Product", "UserParams"],
      ["*Params"],
    );
    expect(result).toEqual(["ProductIdParams", "UserParams"]);
  });

  it("matches wildcard prefix pattern", () => {
    const result = matchExcludePatterns(["InternalFoo", "InternalBar", "Public"], ["Internal*"]);
    expect(result).toEqual(["InternalFoo", "InternalBar"]);
  });

  it("matches multiple patterns", () => {
    const result = matchExcludePatterns(
      ["ProductParams", "productBulkSchema", "Product", "UserList"],
      ["*Params", "*List"],
    );
    expect(result).toEqual(["ProductParams", "UserList"]);
  });

  it("does not match partial name without wildcard", () => {
    expect(matchExcludePatterns(["ProductParams"], ["Params"])).toEqual([]);
  });

  it("escapes regex special characters in pattern", () => {
    expect(matchExcludePatterns(["Foo.Bar", "FooBar"], ["Foo.Bar"])).toEqual(["Foo.Bar"]);
  });
});

describe("applyExcludeSchemas", () => {
  it("removes excluded schema from mergedSchemas", () => {
    const doc = { openapi: "3.0.0", info: { title: "", version: "" } } as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = {
      Product: { type: "object" },
      InternalParams: { type: "object", properties: { id: { type: "number" } } },
    };
    applyExcludeSchemas(doc, mergedSchemas, {
      InternalParams: { type: "object", properties: { id: { type: "number" } } },
    });
    expect(mergedSchemas).not.toHaveProperty("InternalParams");
    expect(mergedSchemas).toHaveProperty("Product");
  });

  it("inlines $ref to excluded schema in operation parameters", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "", version: "" },
      paths: {
        "/products/{id}": {
          get: {
            parameters: [
              {
                in: "path",
                name: "id",
                schema: { $ref: "#/components/schemas/ProductIdParams" },
              },
            ],
          },
        },
      },
    } as unknown as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = {
      Product: { type: "object" },
      ProductIdParams: { type: "object", properties: { id: { type: "integer" } } },
    };
    applyExcludeSchemas(doc, mergedSchemas, {
      ProductIdParams: { type: "object", properties: { id: { type: "integer" } } },
    });

    const schema = (doc as any).paths["/products/{id}"].get.parameters[0].schema;
    expect(schema).toEqual({ type: "object", properties: { id: { type: "integer" } } });
    expect(schema).not.toHaveProperty("$ref");
    expect(mergedSchemas).not.toHaveProperty("ProductIdParams");
  });

  it("inlines $ref in response body", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "", version: "" },
      paths: {
        "/products": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = {
      Product: { type: "object", properties: { name: { type: "string" } } },
    };
    applyExcludeSchemas(doc, mergedSchemas, {
      Product: { type: "object", properties: { name: { type: "string" } } },
    });

    const schema = (doc as any).paths["/products"].get.responses[200].content["application/json"]
      .schema;
    expect(schema).toEqual({ type: "object", properties: { name: { type: "string" } } });
    expect(schema).not.toHaveProperty("$ref");
  });

  it("handles transitive excluded $refs", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "", version: "" },
      paths: {
        "/items": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ItemList" },
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = {
      ItemList: {
        type: "array",
        items: { $ref: "#/components/schemas/ItemParams" },
      },
      ItemParams: { type: "object", properties: { id: { type: "integer" } } },
    };
    applyExcludeSchemas(doc, mergedSchemas, {
      ItemList: {
        type: "array",
        items: { $ref: "#/components/schemas/ItemParams" },
      },
      ItemParams: { type: "object", properties: { id: { type: "integer" } } },
    });

    const schema = (doc as any).paths["/items"].get.responses[200].content["application/json"]
      .schema;
    expect(schema).toEqual({
      type: "array",
      items: { type: "object", properties: { id: { type: "integer" } } },
    });
    expect(mergedSchemas).not.toHaveProperty("ItemList");
    expect(mergedSchemas).not.toHaveProperty("ItemParams");
  });

  it("does nothing when excludedSchemas is empty", () => {
    const doc = { openapi: "3.0.0", info: { title: "", version: "" } } as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = { Product: { type: "object" } };
    applyExcludeSchemas(doc, mergedSchemas, {});
    expect(mergedSchemas).toHaveProperty("Product");
  });

  it("keeps $ref for non-excluded schemas", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "", version: "" },
      paths: {
        "/products": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as OpenApiDocument;
    const mergedSchemas: Record<string, unknown> = {
      Product: { type: "object" },
      InternalParams: { type: "object" },
    };
    applyExcludeSchemas(doc, mergedSchemas, {
      InternalParams: { type: "object" },
    });

    const schema = (doc as any).paths["/products"].get.responses[200].content["application/json"]
      .schema;
    expect(schema).toEqual({ $ref: "#/components/schemas/Product" });
  });
});
