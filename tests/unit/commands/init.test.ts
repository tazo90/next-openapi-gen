import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTempProject, writeJsonFile } from "../../helpers/test-project.js";

type SpinnerMock = {
  start: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
};

async function loadInitModule(execMock: ReturnType<typeof vi.fn>, spinner: SpinnerMock) {
  vi.resetModules();
  vi.doMock("child_process", () => ({
    exec: execMock,
  }));
  vi.doMock("ora", () => ({
    default: vi.fn(() => spinner),
  }));

  return import("@next-openapi-gen/commands/init.js");
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
        version: "1.0.0",
      });
      fs.writeFileSync(path.join(project.root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");

      const { init } = await loadInitModule(execMock, spinner);

      await init({});

      const template = JSON.parse(
        fs.readFileSync(path.join(project.root, "next.openapi.json"), "utf8"),
      ) as { ui: string; schemaType: string; outputFile: string };
      const docsPage = fs.readFileSync(
        path.join(project.root, "src", "app", "api-docs", "page.tsx"),
        "utf8",
      );

      expect(template).toMatchObject({
        ui: "scalar",
        schemaType: "zod",
        outputFile: "openapi.json",
      });
      expect(docsPage).toContain("@scalar/api-reference-react");
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
});
