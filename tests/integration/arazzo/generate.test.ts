import fs from "node:fs";
import path from "node:path";

import { generateProject } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeJsonFile,
} from "../../helpers/test-project.js";

describe("Arazzo generate pipeline", () => {
  it("compiles workflow files against generated operationIds", async () => {
    const project = createTempProject("nxog-arazzo-");

    try {
      fs.mkdirSync(path.join(project.root, "arazzo"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "arazzo", "purchase-order.yaml"),
        `arazzo: 1.1.0
info:
  title: Purchase order
  version: 1.0.0
sourceDescriptions: []
workflows:
  - workflowId: purchaseOrder
    steps:
      - stepId: listOrders
        operationId: getOrdersList
      - stepId: createOrder
        operationId: createOrder
        parameters:
          - name: filter
            in: querystring
            value: "$inputs.filter"
`,
      );
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.2.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
        },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: false,
        ignoreRoutes: [],
        debug: false,
        arazzo: {
          version: "1.1.0",
          files: ["./arazzo/**/*.yaml"],
          outputFile: "arazzo.yaml",
        },
      });
      writeAppRoute(
        project.root,
        ["orders"],
        `/**
 * @openapi
 * @operationId getOrdersList
 */
export async function GET() {}

/**
 * @openapi
 * @operationId createOrder
 */
export async function POST() {}
`,
      );

      const result = await withProjectCwd(project.root, () => generateProject());
      const arazzo = fs.readFileSync(path.join(project.root, "public", "arazzo.yaml"), "utf8");

      expect(arazzo).toContain("arazzo: 1.1.0");
      expect(arazzo).toContain("$self:");
      expect(arazzo).toContain("operationId: getOrdersList");
      expect(arazzo).toContain("type: openapi");
      expect(arazzo).toContain("./openapi.json");
      expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(
        expect.arrayContaining(["spec", "arazzo"]),
      );
      expect(result.diagnostics).toEqual([]);
    } finally {
      project.cleanup();
    }
  });
});
