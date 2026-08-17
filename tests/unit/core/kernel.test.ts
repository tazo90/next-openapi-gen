import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeDocumentArtifact } from "@workspace/openapi-core/core/artifact-writer.js";
import { loadYamlOrJson } from "@workspace/openapi-core/core/document-io.js";
import {
  relativizeDocumentUri,
  resolveDocumentSelf,
} from "@workspace/openapi-core/core/document-uri.js";
import { expandFileGlobs } from "@workspace/openapi-core/core/file-globs.js";
import { buildGenerationIR } from "@workspace/openapi-core/core/generation-ir.js";

describe("generation kernel", () => {
  it("indexes operations by operationId including QUERY", () => {
    const ir = buildGenerationIR({
      openapi: "3.2.0",
      info: { title: "Fixture", version: "1.0.0" },
      paths: {
        "/orders": {
          get: { operationId: "getOrdersList", responses: { "200": { description: "OK" } } },
          query: { operationId: "searchOrders", responses: { "200": { description: "OK" } } },
        },
      },
    });

    expect(ir.operations.map((operation) => operation.method)).toEqual(["get", "query"]);
    expect(ir.operationsById.get("searchOrders")?.path).toBe("/orders");
  });

  it("indexes leftover documents without paths or parameters", () => {
    expect(
      buildGenerationIR({ openapi: "3.0.0", info: { title: "Empty", version: "1" } }).operations,
    ).toEqual([]);
    const ir = buildGenerationIR({
      openapi: "3.0.0",
      info: { title: "Params", version: "1" },
      paths: {
        "/items": {
          parameters: [{ name: "shared", in: "query", schema: { type: "string" } }],
          get: {
            operationId: "listItems",
            responses: { "200": { description: "ok" } },
          },
          post: {
            operationId: "createItem",
            parameters: [{ name: "verbose", in: "query", schema: { type: "boolean" } }],
            responses: { "201": { description: "created" } },
          },
        },
      },
    });
    expect(ir.operationsById.get("listItems")?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "shared" })]),
    );
    expect(ir.operationsById.get("createItem")?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "shared" }),
        expect.objectContaining({ name: "verbose" }),
      ]),
    );
  });

  it("writes YAML and JSON artifacts and reloads them", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-kernel-"));
    try {
      const jsonPath = path.join(root, "spec.json");
      const yamlPath = path.join(root, "spec.yaml");
      writeDocumentArtifact(jsonPath, { openapi: "3.2.0" });
      writeDocumentArtifact(yamlPath, { arazzo: "1.1.0" });

      expect(loadYamlOrJson(jsonPath)).toEqual({ openapi: "3.2.0" });
      expect(loadYamlOrJson(yamlPath)).toEqual({ arazzo: "1.1.0" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands globs and relativizes document URIs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-kernel-glob-"));
    try {
      fs.mkdirSync(path.join(root, "overlays"), { recursive: true });
      fs.writeFileSync(path.join(root, "overlays", "public.overlay.yaml"), "overlay: 1.1.0\n");
      expect(expandFileGlobs(["./overlays/**/*.yaml"], root)).toEqual([
        path.join(root, "overlays", "public.overlay.yaml"),
      ]);
      expect(
        relativizeDocumentUri(path.join(root, "arazzo.yaml"), path.join(root, "openapi.json")),
      ).toBe("./openapi.json");
      expect(resolveDocumentSelf(undefined, path.join(root, "arazzo.yaml"))).toMatch(/^file:/);
      expect(
        resolveDocumentSelf("https://api.example/openapi.json", path.join(root, "arazzo.yaml")),
      ).toBe("https://api.example/openapi.json");
      expect(expandFileGlobs([path.join(root, "overlays", "public.overlay.yaml")], root)).toEqual([
        path.join(root, "overlays", "public.overlay.yaml"),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
