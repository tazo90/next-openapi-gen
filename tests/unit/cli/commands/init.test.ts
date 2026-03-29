import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTempProject, writeJsonFile } from "../../../helpers/test-project.js";

type SpinnerMock = {
  start: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
};

async function loadInitModule(
  execMock: ReturnType<typeof vi.fn>,
  spinner: SpinnerMock,
  setupMocks?: () => void,
) {
  vi.resetModules();
  vi.doUnmock("fs-extra");
  vi.doUnmock("child_process");
  vi.doUnmock("ora");
  vi.doUnmock("@workspace/openapi-init");
  vi.doUnmock("@workspace/openapi-init/init/create-docs-page.js");
  vi.doMock("child_process", () => ({
    exec: execMock,
  }));
  vi.doMock("ora", () => ({
    default: vi.fn(() => spinner),
  }));
  setupMocks?.();

  return import("@workspace/openapi-cli/cli/commands/init.js");
}

describe("init command", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("writes the template, docs page, and installs default scalar and zod dependencies", async () => {
    const project = createTempProject("nxog-init-defaults-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);
      writeJsonFile(path.join(project.root, "package.json"), {
        name: "fixture-app",
        packageManager: "pnpm@10.27.0",
        version: "1.0.0",
      });
      fs.writeFileSync(path.join(project.root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");

      const { init } = await loadInitModule(execMock, spinner);

      await init({});

      const template = JSON.parse(
        fs.readFileSync(path.join(project.root, "next.openapi.json"), "utf8"),
      ) as {
        docsUrl: string;
        framework: {
          kind: string;
          router: string;
        };
        ui: string;
        schemaType: string;
        outputFile: string;
      };
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "app", "api-docs", "page.tsx"),
        "utf8",
      );

      expect(template).toMatchObject({
        docsUrl: "api-docs",
        framework: {
          kind: "nextjs",
          router: "app",
        },
        ui: "scalar",
        schemaType: "zod",
        outputFile: "openapi.json",
      });
      expect(docsPage).toContain("@scalar/api-reference-react");
      expect(docsPage).toContain("export default function ApiDocsPage()");
      expect(docsPage).toContain('url: "/openapi.json"');
      expect(execMock).toHaveBeenCalledTimes(2);
      expect(execMock).toHaveBeenNthCalledWith(
        1,
        "pnpm add @scalar/api-reference-react ajv ",
        expect.any(Function),
      );
      expect(execMock).toHaveBeenNthCalledWith(2, "pnpm add zod", expect.any(Function));
      expect(spinner.fail).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("writes output to the requested path and skips schema installs when the dependency already exists", async () => {
    const project = createTempProject("nxog-init-typescript-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);
      fs.mkdirSync(path.join(project.root, "config"), { recursive: true });
      writeJsonFile(path.join(project.root, "package.json"), {
        name: "fixture-app",
        packageManager: "pnpm@10.27.0",
        version: "1.0.0",
        devDependencies: {
          typescript: "^5.9.0",
        },
      });

      const { init } = await loadInitModule(execMock, spinner);

      await init({
        ui: "none",
        schema: "typescript",
        output: "config/custom.openapi.json",
      });

      expect(fs.existsSync(path.join(project.root, "config", "custom.openapi.json"))).toBe(true);
      expect(fs.existsSync(path.join(project.root, "src", "app", "api-docs", "page.tsx"))).toBe(
        false,
      );
      expect(execMock).not.toHaveBeenCalled();
      expect(spinner.fail).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("reports initialization failures through the spinner", async () => {
    const project = createTempProject("nxog-init-failure-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);

      const { init } = await loadInitModule(execMock, spinner, () => {
        vi.doMock("@workspace/openapi-init/init/create-docs-page.js", () => ({
          createDocsPage: vi.fn(async () => {
            throw new Error("disk full");
          }),
        }));
      });

      await init({});

      expect(fs.existsSync(path.join(project.root, "next.openapi.json"))).toBe(true);
      expect(execMock).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("honors an explicit docs route and ui choice", async () => {
    const project = createTempProject("nxog-init-redoc-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);
      fs.mkdirSync(path.join(project.root, "config"), { recursive: true });
      writeJsonFile(path.join(project.root, "package.json"), {
        name: "fixture-app",
        packageManager: "pnpm@10.27.0",
        version: "1.0.0",
      });

      const { init } = await loadInitModule(execMock, spinner);

      await init({
        docsUrl: "internal/reference",
        output: "config/template.json",
        schema: "zod",
        ui: "redoc",
      });

      const template = JSON.parse(
        fs.readFileSync(path.join(project.root, "config", "template.json"), "utf8"),
      ) as { docsUrl: string; ui: string; outputFile: string };
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "app", "internal", "reference", "page.tsx"),
        "utf8",
      );

      expect(template).toMatchObject({
        docsUrl: "internal/reference",
        ui: "redoc",
      });
      expect(docsPage).toContain("RedocStandalone");
      expect(execMock).toHaveBeenNthCalledWith(1, "pnpm add redoc ", expect.any(Function));
      expect(execMock).toHaveBeenNthCalledWith(2, "pnpm add zod", expect.any(Function));
      expect(spinner.fail).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("writes TanStack-specific template defaults and route files", async () => {
    const project = createTempProject("nxog-init-tanstack-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);
      writeJsonFile(path.join(project.root, "package.json"), {
        name: "fixture-app",
        packageManager: "pnpm@10.27.0",
        version: "1.0.0",
      });

      const { init } = await loadInitModule(execMock, spinner);

      await init({
        framework: "tanstack",
        ui: "scalar",
      });

      const template = JSON.parse(
        fs.readFileSync(path.join(project.root, "next.openapi.json"), "utf8"),
      ) as {
        apiDir: string;
        framework: {
          kind: string;
        };
      };
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "routes", "api-docs.tsx"),
        "utf8",
      );

      expect(template).toMatchObject({
        apiDir: "./src/routes/api",
        framework: {
          kind: "tanstack",
        },
      });
      expect(docsPage).toContain('createFileRoute("/api-docs")');
      expect(docsPage).toContain('url: "/openapi.json"');
      expect(spinner.fail).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });

  it("falls back to default docs and schema values when the template omits them", async () => {
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });
    const createDocsPage = vi.fn(async () => "src/app/api-docs/page.tsx");
    const installDependencies = vi.fn(async () => undefined);

    const { init } = await loadInitModule(execMock, spinner, () => {
      vi.doMock("@workspace/openapi-init", () => ({
        createDocsPage,
        createOpenApiTemplate: vi.fn(() => ({
          docsUrl: undefined,
          outputFile: undefined,
          ui: undefined,
        })),
        extendOpenApiTemplate: vi.fn(),
        getErrorMessage: vi.fn((error: unknown) => String(error)),
        getOutputPath: vi.fn(() => "/tmp/fallback-openapi.json"),
        installDependencies,
      }));
    });

    await init({});

    expect(createDocsPage).toHaveBeenCalledWith({
      docsUrl: "api-docs",
      outputFile: "openapi.json",
      ui: "scalar",
    });
    expect(installDependencies).toHaveBeenCalledWith("scalar", "zod", expect.anything());
  });

  it("writes React Router docs routes for the requested framework", async () => {
    const project = createTempProject("nxog-init-react-router-");
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });

    try {
      process.chdir(project.root);
      writeJsonFile(path.join(project.root, "package.json"), {
        name: "fixture-app",
        packageManager: "pnpm@10.27.0",
        version: "1.0.0",
      });

      const { init } = await loadInitModule(execMock, spinner);

      await init({
        docsUrl: "internal/reference",
        framework: "react-router",
        ui: "swagger",
      });

      const template = JSON.parse(
        fs.readFileSync(path.join(project.root, "next.openapi.json"), "utf8"),
      ) as {
        apiDir: string;
        framework: {
          kind: string;
        };
      };
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "routes", "internal.reference.tsx"),
        "utf8",
      );

      expect(template).toMatchObject({
        apiDir: "./src/routes/api",
        framework: {
          kind: "reactrouter",
        },
      });
      expect(docsPage).toContain("export default function ApiDocsPage()");
      expect(docsPage).toContain('<SwaggerUI url="/openapi.json" />');
      expect(execMock).toHaveBeenNthCalledWith(
        1,
        "pnpm add swagger-ui swagger-ui-react --no-strict-peer-dependencies",
        expect.any(Function),
      );
      expect(execMock).toHaveBeenNthCalledWith(
        2,
        "pnpm add -D @types/swagger-ui-react --no-strict-peer-dependencies",
        expect.any(Function),
      );
      expect(execMock).toHaveBeenNthCalledWith(3, "pnpm add zod", expect.any(Function));
      expect(spinner.fail).not.toHaveBeenCalled();
    } finally {
      project.cleanup();
    }
  });
});
