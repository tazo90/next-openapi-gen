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
  vi.doMock("@workspace/openapi-init/init/ui-registry.js", () => ({
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
  vi.doMock("@workspace/openapi-init/init/package-manager.js", () => ({
    getPackageManager: vi.fn(async () => packageManager),
    hasDependency,
  }));

  return import("@workspace/openapi-init/init/install-dependencies.js");
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
      "pnpm",
      hasDependencyMock,
    );

    await installDependencies("swagger", "zod", spinner);

    expect(execMock).toHaveBeenNthCalledWith(
      1,
      "pnpm add swagger-ui swagger-ui-react ",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(
      2,
      "pnpm add -D @types/swagger-ui-react ",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(3, "pnpm add zod", expect.any(Function));
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
      "pnpm",
      hasDependencyMock,
    );

    await installDependencies("none", ["typescript"], spinner);

    expect(execMock).toHaveBeenCalledWith("pnpm add -D typescript", expect.any(Function));
    expect(spinner.succeed).toHaveBeenCalledWith("Installing typescript...");
    expect(spinner.succeed).toHaveBeenCalledWith("Successfully installed typescript.");
  });

  it("uses pnpm install flags for dev dependencies and skips already-installed schemas", async () => {
    const spinner: SpinnerMock = {
      succeed: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });
    const hasDependencyMock = vi.fn(async (pkg: string) => pkg === "zod");

    const { installDependencies } = await loadInstallDependenciesModule(
      execMock,
      "pnpm",
      hasDependencyMock,
    );

    await installDependencies("swagger", ["zod", "typescript"], spinner);

    expect(execMock).toHaveBeenNthCalledWith(
      1,
      "pnpm add swagger-ui swagger-ui-react ",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(
      2,
      "pnpm add -D @types/swagger-ui-react ",
      expect.any(Function),
    );
    expect(execMock).toHaveBeenNthCalledWith(3, "pnpm add -D typescript", expect.any(Function));
    expect(execMock).toHaveBeenCalledTimes(3);
  });

  it("skips all install work when ui is none and schema dependencies already exist", async () => {
    const spinner: SpinnerMock = {
      succeed: vi.fn(),
    };
    const execMock = vi.fn((command: string, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as never;
    });
    const hasDependencyMock = vi.fn(async () => true);

    const { installDependencies } = await loadInstallDependenciesModule(
      execMock,
      "pnpm",
      hasDependencyMock,
    );

    await installDependencies("none", ["zod", "typescript"], spinner);

    expect(execMock).not.toHaveBeenCalled();
    expect(spinner.succeed).not.toHaveBeenCalled();
  });
});
