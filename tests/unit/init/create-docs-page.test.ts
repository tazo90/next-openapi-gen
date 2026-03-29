import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDocsPage,
  getDocsPageRelativePath,
} from "@workspace/openapi-init/init/create-docs-page.js";

import { createTempProject } from "../../helpers/test-project.js";

describe("createDocsPage", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
  });

  it("writes TanStack docs routes using file-route syntax", async () => {
    const project = createTempProject("nxog-tanstack-docs-");

    try {
      process.chdir(project.root);

      const relativePath = await createDocsPage({
        framework: "tanstack",
        docsUrl: "internal/reference",
        ui: "scalar",
        outputFile: "openapi.json",
      });
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "routes", "internal.reference.tsx"),
        "utf8",
      );

      expect(relativePath).toBe(path.join("src", "routes", "internal.reference.tsx"));
      expect(docsPage).toContain('createFileRoute("/internal/reference")');
      expect(docsPage).toContain("function ApiDocsPage()");
      expect(docsPage).toContain('url: "/openapi.json"');
    } finally {
      project.cleanup();
    }
  });

  it("writes React Router docs routes using route-module defaults", async () => {
    const project = createTempProject("nxog-react-router-docs-");

    try {
      process.chdir(project.root);

      const relativePath = await createDocsPage({
        framework: "react-router",
        docsUrl: "api-docs",
        ui: "redoc",
        outputFile: "openapi.json",
      });
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "routes", "api-docs.tsx"),
        "utf8",
      );

      expect(relativePath).toBe(path.join("src", "routes", "api-docs.tsx"));
      expect(docsPage).toContain("export default function ApiDocsPage()");
      expect(docsPage).toContain('<RedocStandalone specUrl="/openapi.json" />');
      expect(docsPage).not.toContain("OpenApiDocsContent");
    } finally {
      project.cleanup();
    }
  });

  it("returns the expected route file paths for each framework", () => {
    expect(getDocsPageRelativePath("tanstack", "internal/reference")).toBe(
      path.join("src", "routes", "internal.reference.tsx"),
    );
    expect(getDocsPageRelativePath("react-router", "internal/reference")).toBe(
      path.join("src", "routes", "internal.reference.tsx"),
    );
  });

  it("uses docsUrl to determine the generated Next app route path", async () => {
    const project = createTempProject("nxog-docs-path-");

    try {
      process.chdir(project.root);

      const pagePath = await createDocsPage({
        docsUrl: "developer/reference",
        framework: "next",
        ui: "scalar",
        outputFile: "openapi.json",
      });
      const componentPath = path.join(
        project.root,
        "src",
        "app",
        "developer",
        "reference",
        "page.tsx",
      );
      const pageSource = fs.readFileSync(componentPath, "utf8");

      expect(pagePath).toBe("src/app/developer/reference/page.tsx");
      expect(getDocsPageRelativePath("next", "developer/reference")).toBe(
        path.join("src", "app", "developer", "reference", "page.tsx"),
      );
      expect(fs.existsSync(componentPath)).toBe(true);
      expect(pageSource).toContain("export default function ApiDocsPage()");
      expect(pageSource).toContain('url: "/openapi.json"');
    } finally {
      project.cleanup();
    }
  });
});
