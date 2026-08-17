import fs from "node:fs";
import path from "node:path";

import { generateProject } from "next-openapi-gen";
import { describe, expect, it } from "vitest";

import {
  copyProjectFixture,
  getProjectFixturePath,
  materializeTemplateVariant,
  withProjectCwd,
} from "../../helpers/test-project.js";

describe("generator disk cache", () => {
  it("hits for an unchanged fixture and invalidates after real route and schema edits", async () => {
    const project = copyProjectFixture(getProjectFixturePath("next", "app-router", "core-flow"));

    try {
      materializeTemplateVariant(project.root, "3.2", {
        cache: true,
        generatedDir: ".openapi-cache",
      });

      const first = await withProjectCwd(project.root, () => generateProject());
      const unchanged = await withProjectCwd(project.root, () => generateProject());
      expect(first.cached).toBe(false);
      expect(unchanged.cached).toBe(true);
      expect(
        readGeneratedSpec(project.root).components.schemas.ReportSummary?.properties?.generatedAt,
      ).toEqual({ type: "string", format: "date-time" });

      const routeFile = path.join(project.root, "src", "app", "api", "reports", "route.ts");
      fs.writeFileSync(
        routeFile,
        fs.readFileSync(routeFile, "utf8").replace(" * List reports", " * List cached reports"),
      );

      const routeEdit = await withProjectCwd(project.root, () => generateProject());
      const afterRouteEdit = await withProjectCwd(project.root, () => generateProject());
      expect(routeEdit.cached).toBe(false);
      expect(afterRouteEdit.cached).toBe(true);
      expect(readGeneratedSpec(project.root).paths["/reports"]?.get?.summary).toBe(
        "List cached reports",
      );

      const schemaFile = path.join(project.root, "src", "schemas", "user.ts");
      fs.writeFileSync(
        schemaFile,
        fs.readFileSync(schemaFile, "utf8").replace("generatedAt: Date", "generatedAt: string"),
      );

      const schemaEdit = await withProjectCwd(project.root, () => generateProject());
      const afterSchemaEdit = await withProjectCwd(project.root, () => generateProject());
      expect(schemaEdit.cached).toBe(false);
      expect(afterSchemaEdit.cached).toBe(true);
      expect(
        readGeneratedSpec(project.root).components.schemas.ReportSummary?.properties?.generatedAt,
      ).toEqual({ type: "string" });

      const addedRouteDir = path.join(project.root, "src", "app", "api", "cache-added");
      const addedRouteFile = path.join(addedRouteDir, "route.ts");
      fs.mkdirSync(addedRouteDir, { recursive: true });
      fs.writeFileSync(
        addedRouteFile,
        `/**
 * @openapi
 * @summary Added after the first scan
 */
export async function GET() {}
`,
      );

      const routeAdded = await withProjectCwd(project.root, () => generateProject());
      expect(routeAdded.cached).toBe(false);
      expect(readGeneratedSpec(project.root).paths["/cache-added"]?.get?.summary).toBe(
        "Added after the first scan",
      );

      fs.rmSync(addedRouteDir, { recursive: true });
      const routeDeleted = await withProjectCwd(project.root, () => generateProject());
      expect(routeDeleted.cached).toBe(false);
      expect(readGeneratedSpec(project.root).paths["/cache-added"]).toBeUndefined();
    } finally {
      project.cleanup();
    }
  });

  it("reuses the cached base document while rerunning real overlay artifacts", async () => {
    const project = copyProjectFixture(getProjectFixturePath("next", "app-router", "core-flow"));
    const overlayFile = path.join(project.root, "src", "public.overlay.yaml");

    try {
      materializeTemplateVariant(project.root, "3.2", {
        cache: true,
        generatedDir: ".openapi-cache",
        overlay: { apply: ["./src/public.overlay.yaml"] },
      });
      fs.writeFileSync(overlayFile, createTitleOverlay("First cached title"));

      const first = await withProjectCwd(project.root, () => generateProject());
      expect(first.cached).toBe(false);
      expect(readGeneratedSpec(project.root).info.title).toBe("First cached title");

      fs.writeFileSync(overlayFile, createTitleOverlay("Updated cached title"));
      const second = await withProjectCwd(project.root, () => generateProject());

      expect(second.cached).toBe(true);
      expect(readGeneratedSpec(project.root).info.title).toBe("Updated cached title");
    } finally {
      project.cleanup();
    }
  });

  it("resets same-process runtime caches when metadata is corrupt or missing", async () => {
    const project = copyProjectFixture(getProjectFixturePath("next", "app-router", "core-flow"));

    try {
      materializeTemplateVariant(project.root, "3.2", {
        cache: true,
        generatedDir: ".openapi-cache",
      });
      const schemaFile = path.join(project.root, "src", "schemas", "user.ts");
      const cacheFile = path.join(project.root, ".openapi-cache", "cache", "generate.json");

      await withProjectCwd(project.root, () => generateProject());
      fs.writeFileSync(
        schemaFile,
        fs.readFileSync(schemaFile, "utf8").replace("generatedAt: Date", "generatedAt: string"),
      );
      fs.writeFileSync(cacheFile, "{corrupt");

      const afterCorruptMetadata = await withProjectCwd(project.root, () => generateProject());
      expect(afterCorruptMetadata.cached).toBe(false);
      expect(
        readGeneratedSpec(project.root).components.schemas.ReportSummary?.properties?.generatedAt,
      ).toEqual({ type: "string" });

      fs.writeFileSync(
        schemaFile,
        fs.readFileSync(schemaFile, "utf8").replace("generatedAt: string", "generatedAt: Date"),
      );
      fs.rmSync(cacheFile);

      const afterMissingMetadata = await withProjectCwd(project.root, () => generateProject());
      expect(afterMissingMetadata.cached).toBe(false);
      expect(
        readGeneratedSpec(project.root).components.schemas.ReportSummary?.properties?.generatedAt,
      ).toEqual({ type: "string", format: "date-time" });
    } finally {
      project.cleanup();
    }
  });

  it("keeps the cache record bound to the prior base after emitter failure and source revert", async () => {
    const project = copyProjectFixture(getProjectFixturePath("next", "app-router", "core-flow"));
    const overlayFile = path.join(project.root, "src", "public.overlay.yaml");
    const routeFile = path.join(project.root, "src", "app", "api", "reports", "route.ts");

    try {
      materializeTemplateVariant(project.root, "3.2", {
        cache: true,
        generatedDir: ".openapi-cache",
        overlay: { apply: ["./src/public.overlay.yaml"] },
      });
      fs.writeFileSync(overlayFile, createTitleOverlay("Stable title"));
      await withProjectCwd(project.root, () => generateProject());
      const cacheFile = path.join(project.root, ".openapi-cache", "cache", "generate.json");
      const stableRecord = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<
        string,
        unknown
      > & {
        baseDocumentFile: string;
      };

      const originalRoute = fs.readFileSync(routeFile, "utf8");
      fs.writeFileSync(routeFile, originalRoute.replace(" * List reports", " * Changed reports"));
      fs.writeFileSync(overlayFile, "overlay: [");
      await expect(withProjectCwd(project.root, () => generateProject())).rejects.toThrow(/.+/);
      expect(JSON.parse(fs.readFileSync(cacheFile, "utf8"))).toEqual(stableRecord);
      expect(
        (
          JSON.parse(fs.readFileSync(stableRecord.baseDocumentFile, "utf8")) as {
            paths: Record<string, { get?: { summary?: string } }>;
          }
        ).paths["/reports"]?.get?.summary,
      ).toBe("List reports");

      fs.writeFileSync(routeFile, originalRoute);
      fs.writeFileSync(overlayFile, createTitleOverlay("Stable title"));
      await withProjectCwd(project.root, () => generateProject());

      expect(readGeneratedSpec(project.root).paths["/reports"]?.get?.summary).toBe("List reports");
    } finally {
      project.cleanup();
    }
  });
});

function readGeneratedSpec(projectRoot: string) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "openapi.json"), "utf8")) as {
    components: {
      schemas: Record<
        string,
        { properties?: Record<string, { format?: string; type?: string } | undefined> } | undefined
      >;
    };
    info: { title: string };
    paths: Record<string, { get?: { summary?: string } } | undefined>;
  };
}

function createTitleOverlay(title: string): string {
  return `overlay: 1.1.0
info:
  title: Cache fixture overlay
  version: 1.0.0
actions:
  - target: "$.info"
    update:
      title: ${title}
`;
}
