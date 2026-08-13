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

describe("overlay generate pipeline", () => {
  it("applies overlays before writing OpenAPI and can emit an Overlay document", async () => {
    const project = createTempProject("nxog-overlay-");

    try {
      fs.mkdirSync(path.join(project.root, "overlays"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "overlays", "public.overlay.yaml"),
        `overlay: 1.1.0
info:
  title: Public overlay
  version: 1.0.0
actions:
  - target: "$.paths['/webhooks/payment']"
    remove: true
  - target: "$.info"
    update:
      title: Public API
`,
      );
      fs.writeFileSync(
        path.join(project.root, "overlays", "src.overlay.yaml"),
        `overlay: 1.1.0
info:
  title: Generated overlay
  version: 1.0.0
actions:
  - target: "$.info.description"
    update: Partner-facing API
`,
      );
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.2.0",
        info: {
          title: "Internal API",
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
        overlay: {
          version: "1.1.0",
          apply: ["./overlays/public.overlay.yaml"],
          generate: {
            files: ["./overlays/src.overlay.yaml"],
            outputFile: "partner.overlay.yaml",
          },
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
`,
      );
      writeAppRoute(
        project.root,
        ["webhooks", "payment"],
        `/**
 * @openapi
 * @operationId receivePayment
 */
export async function POST() {}
`,
      );

      const result = await withProjectCwd(project.root, () => generateProject());
      const spec = JSON.parse(
        fs.readFileSync(path.join(project.root, "public", "openapi.json"), "utf8"),
      ) as {
        info: { title: string };
        paths: Record<string, unknown>;
      };
      const overlay = fs.readFileSync(
        path.join(project.root, "public", "partner.overlay.yaml"),
        "utf8",
      );

      expect(spec.info.title).toBe("Public API");
      expect(spec.paths).toHaveProperty("/orders");
      expect(spec.paths).not.toHaveProperty("/webhooks/payment");
      expect(overlay).toContain("overlay: 1.1.0");
      expect(overlay).toContain("extends:");
      expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(
        expect.arrayContaining(["spec", "overlay"]),
      );
    } finally {
      project.cleanup();
    }
  });
});
