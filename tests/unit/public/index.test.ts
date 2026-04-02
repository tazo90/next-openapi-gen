import { afterEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

const { buildProgram, coreGenerateProject, coreOpenApiGenerator, coreWatchProject } = vi.hoisted(
  () => ({
    buildProgram: vi.fn<MockFn>(),
    coreGenerateProject: vi.fn<MockFn>(),
    coreOpenApiGenerator: vi.fn<MockFn>(),
    coreWatchProject: vi.fn<MockFn>(),
  }),
);

vi.mock("@workspace/openapi-cli", () => ({
  buildProgram,
}));

vi.mock("@workspace/openapi-core", () => ({
  DEFAULT_CONFIG_FILENAMES: [],
  FrameworkKind: {},
  LEGACY_CONFIG_FILENAMES: [],
  MODERN_CONFIG_FILENAMES: [],
  OpenApiGenerator: class MockCoreOpenApiGenerator {
    constructor(options: unknown) {
      coreOpenApiGenerator(options);
    }
  },
  defineConfig: vi.fn<MockFn>((config) => config),
  generateProject: coreGenerateProject,
  loadConfig: vi.fn<MockFn>(),
  resolveGeneratedWorkspaceDir: vi.fn<MockFn>(),
  watchProject: coreWatchProject,
}));

import {
  OpenApiGenerator,
  buildProgram as publicBuildProgram,
  generateProject,
  watchProject,
} from "../../../packages/next-openapi-gen/src/index.ts";

describe("next-openapi-gen public facade", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps the core generator with default adapters", () => {
    new OpenApiGenerator({
      configPath: "openapi-gen.config.ts",
    });

    expect(coreOpenApiGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
        adapters: expect.objectContaining({
          createFrameworkSource: expect.any(Function),
          emitDocsArtifact: expect.any(Function),
        }),
      }),
    );
    expect(publicBuildProgram).toBe(buildProgram);
  });

  it("wraps generateProject and watchProject with default adapters", () => {
    generateProject({
      configPath: "openapi-gen.config.ts",
    });
    watchProject({
      configPath: "openapi-gen.config.ts",
    });

    expect(coreGenerateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
        adapters: expect.objectContaining({
          createFrameworkSource: expect.any(Function),
          emitDocsArtifact: expect.any(Function),
        }),
      }),
    );
    expect(coreWatchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "openapi-gen.config.ts",
        adapters: expect.objectContaining({
          createFrameworkSource: expect.any(Function),
          emitDocsArtifact: expect.any(Function),
        }),
      }),
    );
  });
});
