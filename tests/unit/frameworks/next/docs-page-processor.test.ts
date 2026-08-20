import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { NextOpenApiConfigFile } from "@workspace/openapi-core/core/config/types.js";
import { FrameworkKind } from "@workspace/openapi-core/shared/types.js";
import {
  createNextDocsPage,
  emitNextDocsArtifact,
} from "@workspace/openapi-framework-next/frameworks/next/docs-page-processor.js";

describe("createNextDocsPage", () => {
  const previousCwd = process.cwd();
  const roots: string[] = [];

  afterEach(() => {
    process.chdir(previousCwd);
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("writes docs pages under src/app when src exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-src-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    process.chdir(root);

    const pagePath = await createNextDocsPage("developer/reference", "scalar", "openapi.json");

    expect(pagePath).toBe(path.join("src", "app", "developer", "reference", "page.tsx"));
    expect(fs.existsSync(path.join(root, "src", "app", "developer", "reference", "page.tsx"))).toBe(
      true,
    );
  });

  it("writes docs pages under app when src does not exist", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-app-"));
    roots.push(root);
    process.chdir(root);

    const pagePath = await createNextDocsPage("api-docs", "scalar", "openapi.json");

    expect(pagePath).toBe(path.join("app", "api-docs", "page.tsx"));
    expect(fs.existsSync(path.join(root, "app", "api-docs", "page.tsx"))).toBe(true);
  });

  it('returns null when ui is "none"', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-none-"));
    roots.push(root);
    process.chdir(root);

    await expect(createNextDocsPage("api-docs", "none", "openapi.json")).resolves.toBeNull();
    expect(fs.existsSync(path.join(root, "app", "api-docs", "page.tsx"))).toBe(false);
  });

  it("emits a docs artifact for enabled Next configs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-next-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "developer/reference",
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "next-openapi.config.ts"),
      },
      outputFile: "openapi.json",
    });

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
      }),
    );
  });

  it("returns null when docs generation is disabled", async () => {
    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: false,
          },
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
        },
        configPath: "/tmp/next-openapi.config.ts",
      },
      outputFile: "openapi.json",
    });

    expect(artifact).toBeNull();
  });

  it("emits a TanStack docs route when the project framework is TanStack", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-tanstack-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          framework: {
            kind: FrameworkKind.Tanstack,
          },
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "src", "routes", "api-docs.tsx");
    const docsPage = fs.readFileSync(docsPath, "utf8");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
    expect(docsPage).toContain('createFileRoute("/api-docs")');
  });

  it("emits a React Router docs route when the project framework is React Router", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-rr-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          framework: {
            kind: FrameworkKind.ReactRouter,
          },
          outputFile: "openapi.json",
          ui: "redoc",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "src", "routes", "api-docs.tsx");
    const docsPage = fs.readFileSync(docsPath, "utf8");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
    expect(docsPage).toContain("export default function ApiDocsPage()");
    expect(docsPage).toContain('<RedocStandalone specUrl="/openapi.json" />');
  });

  it("honors docs.framework over the project framework kind", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-vite-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
            framework: "vite",
          },
          docsUrl: "internal/reference",
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "src", "routes", "internal.reference.tsx");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
    expect(fs.readFileSync(docsPath, "utf8")).toContain('createFileRoute("/internal/reference")');
  });

  it("writes a Next docs page when docs.framework is next", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-docs-next-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
            framework: "next",
          },
          docsUrl: "api-docs",
          framework: {
            kind: FrameworkKind.Tanstack,
          },
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "app", "api-docs", "page.tsx");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
  });

  it("writes a React Router docs page when docs.framework is react-router", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-docs-rr-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
            framework: "react-router",
          },
          docsUrl: "api-docs",
          framework: {
            kind: FrameworkKind.Tanstack,
          },
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "src", "routes", "api-docs.tsx");
    const docsPage = fs.readFileSync(docsPath, "utf8");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
    expect(docsPage).toContain("export default function ApiDocsPage()");
  });

  it("defaults to a Next docs page when the project framework is omitted", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-no-kind-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          outputFile: "openapi.json",
          ui: "scalar",
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "app", "api-docs", "page.tsx");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
  });

  it("maps the legacy next project kind to a Next docs page", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-legacy-next-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          framework: {
            kind: "next",
          },
          outputFile: "openapi.json",
          ui: "scalar",
        } as NextOpenApiConfigFile,
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "app", "api-docs", "page.tsx");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
  });

  it("maps the legacy react-router project kind to a React Router docs page", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-legacy-rr-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          framework: {
            kind: "react-router",
          },
          outputFile: "openapi.json",
          ui: "scalar",
        } as NextOpenApiConfigFile,
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });
    const docsPath = path.join(root, "src", "routes", "api-docs.tsx");

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(docsPath),
      }),
    );
  });

  it("returns null when the docs page helper does not create a page", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-none-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          docsUrl: "api-docs",
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
          ui: "none",
        },
        configPath: path.join(root, "next-openapi.config.ts"),
      },
      outputFile: "openapi.json",
    });

    expect(artifact).toBeNull();
  });

  it("uses default docs settings when config values are omitted", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-artifact-defaults-"));
    roots.push(root);
    process.chdir(root);

    const artifact = await emitNextDocsArtifact({
      loadedConfig: {
        config: {
          docs: {
            enabled: true,
          },
          framework: {
            kind: FrameworkKind.Nextjs,
            router: "app",
          },
        },
        configPath: path.join(root, "openapi-gen.config.ts"),
      },
      outputFile: "openapi.json",
    });

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "docs",
        path: fs.realpathSync(path.join(root, "app", "api-docs", "page.tsx")),
      }),
    );
  });
});
