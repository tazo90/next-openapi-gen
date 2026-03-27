import { afterEach, describe, expect, it, vi } from "vitest";

type SpinnerMock = {
  succeed: ReturnType<typeof vi.fn>;
};

async function loadInstallDependenciesModule(
  execMock: ReturnType<typeof vi.fn>,
  packageManager: string,
  hasDependency: ReturnType<typeof vi.fn>,
) {
  vi.resetModules();
  vi.doMock("node:child_process", () => ({
    exec: execMock,
  }));
  vi.doMock("@next-openapi-gen/init/ui-registry.js", () => ({
    getDocsPageDependencies: vi.fn((ui: string) =>
      ui === "swagger" ? "swagger-ui swagger-ui-react" : "",
    ),
    getDocsPageDevDependencies: vi.fn((ui: string) =>
      ui === "swagger" ? "@types/swagger-ui-react" : "",
    ),
    getDocsPageInstallFlags: vi.fn((ui: string, manager: string) =>
      ui === "swagger" && manager === "npm" ? "--legacy-peer-deps" : "",
    ),
  }));
  vi.doMock("@next-openapi-gen/init/package-manager.js", () => ({
    getPackageManager: vi.fn(async () => packageManager),
    hasDependency,
  }));

  return import("@next-openapi-gen/init/install-dependencies.js");
}

describe("installDependencies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("installs UI deps, UI dev deps, and missing zod dependencies", async () => {
    const spinner: SpinnerMock = {
      succeed: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });
    const hasDependencyMock = vi.fn(async () => false);

    const { installDependencies } = await loadInstallDependenciesModule(
      execMock,
      "npm",
      hasDependencyMock,
    );

    await installDependencies("swagger", "zod", spinner);

    expect(execMock).toHaveBeenNthCalledWith(
      1,
      "npm install swagger-ui swagger-ui-react --legacy-peer-deps",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(
      2,
      "npm install --save-dev @types/swagger-ui-react --legacy-peer-deps",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(3, "npm install zod", expect.any(Function));
    expect(spinner.succeed).toHaveBeenCalledWith(
      "Installing @types/swagger-ui-react dev dependencies...",
    );
    expect(spinner.succeed).toHaveBeenCalledWith("Successfully installed @types/swagger-ui-react.");
  });

  it("installs TypeScript as a dev dependency when requested", async () => {
    const spinner: SpinnerMock = {
      succeed: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });
    const hasDependencyMock = vi.fn(async (pkg: string) => pkg !== "typescript");

    const { installDependencies } = await loadInstallDependenciesModule(
      execMock,
      "npm",
      hasDependencyMock,
    );

    await installDependencies("none", ["typescript"], spinner);

    expect(execMock).toHaveBeenCalledWith(
      "npm install --save-dev typescript",
      expect.any(Function),
    );
    expect(spinner.succeed).toHaveBeenCalledWith("Installing typescript...");
    expect(spinner.succeed).toHaveBeenCalledWith("Successfully installed typescript.");
  });
});
