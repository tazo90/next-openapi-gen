import fs from "node:fs";
import path from "node:path";

import { FrameworkKind, generateProject } from "next-openapi-gen";
import { describe, expect, it, vi } from "vitest";

import type { GenerationContext } from "@workspace/openapi-core/core/adapters.js";
import {
  generateFromLoadedConfig,
  runExternalCommand,
} from "@workspace/openapi-core/core/generate.js";
import { createInputFingerprint } from "@workspace/openapi-core/core/input-fingerprint.js";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeJsonFile,
} from "../../helpers/test-project.js";

describe("generateProject", () => {
  it("writes the spec and incremental manifest", async () => {
    const project = createTempProject("nxog-core-generate-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
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
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 * @response UserList
 */
export async function GET() {}

export type UserList = {
  items: string[];
};
`,
      );

      const { manifestPath, outputPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          outputPath: fs.realpathSync(path.join(project.root, "public", "openapi.json")),
          manifestPath: path.join(project.root, ".openapi-cache", "manifest.json"),
        };
      });

      expect(result.artifacts).toContainEqual({
        kind: "spec",
        path: outputPath,
      });
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        outputFile: string;
      };
      expect(manifest.outputFile).toBe(outputPath);
    } finally {
      project.cleanup();
    }
  });

  it("covers leftover disk-cache hit and missing input roots", async () => {
    const project = createTempProject("nxog-core-generate-cache-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: { title: "API Documentation", version: "1.0.0" },
        apiDir: "./src/app/api",
        schemaDir: ["./src", "./missing-schemas"],
        schemaFiles: ["./missing-schema.ts"],
        schemaType: "typescript",
        outputDir: "./public",
        outputFile: "openapi.json",
        cache: true,
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["health"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );
      fs.writeFileSync(path.join(project.root, "package.json"), "{}\n");

      const { first, second } = await withProjectCwd(project.root, async () => {
        const first = await generateProject();
        const second = await generateProject();
        return { first, second };
      });

      expect(first.cached).not.toBe(true);
      expect(second.cached).toBe(true);
      expect(second.outputFile).toBe(first.outputFile);

      const cacheFile = path.join(project.root, ".openapi-cache", "cache", "generate.json");
      const record = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as { fingerprint: string };
      record.fingerprint = "stale";
      fs.writeFileSync(cacheFile, `${JSON.stringify(record)}\n`);
      const mismatched = await withProjectCwd(project.root, () => generateProject());
      expect(mismatched.cached).not.toBe(true);

      fs.writeFileSync(cacheFile, "{not valid json");
      const corruptCache = await withProjectCwd(project.root, () => generateProject());
      expect(corruptCache.cached).not.toBe(true);
      expect(() => JSON.parse(fs.readFileSync(cacheFile, "utf8"))).not.toThrow();

      const sdkRuns: Array<{ command: string; args: string[] }> = [];
      await withProjectCwd(project.root, () =>
        generateFromLoadedConfig(
          {
            configPath: undefined,
            config: {
              apiDir: "./src/app/api",
              schemaDir: "./src",
              schemaType: "typescript",
              outputDir: "./public",
              outputFile: "openapi.json",
              cache: false,
              framework: { kind: FrameworkKind.Nextjs },
              diagnostics: {},
              clientSdk: [{ command: "echo", args: ["--flag"], enabled: true }],
            },
          },
          undefined,
          {
            createFrameworkSource: () => ({
              getScanRoots: () => [path.join(project.root, "src", "app", "api")],
              shouldProcessFile: () => true,
              getRoutePath: (filePath: string) => filePath,
              precheckFile: () => true,
              processFile: () => [],
            }),
          },
          async (command, args) => {
            sdkRuns.push({ command, args });
          },
        ),
      );
      expect(sdkRuns).toEqual([
        expect.objectContaining({ command: "echo", args: expect.arrayContaining(["--flag"]) }),
      ]);

      fs.writeFileSync(cacheFile, "null\n");
      const nullCache = await withProjectCwd(project.root, () => generateProject());
      expect(nullCache.cached).not.toBe(true);

      const schemaFile = path.join(project.root, "src", "schema-as-root.ts");
      fs.writeFileSync(schemaFile, "export type Root = string;\n");
      fs.mkdirSync(path.join(project.root, "src", "node_modules", "pkg"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "src", "node_modules", "pkg", "index.ts"),
        "export {}\n",
      );

      await withProjectCwd(project.root, () =>
        generateFromLoadedConfig(
          {
            configPath: undefined,
            config: {
              apiDir: undefined,
              schemaDir: schemaFile,
              schemaType: "typescript",
              outputDir: "./public",
              outputFile: "openapi-file-root.json",
              cache: true,
              framework: { kind: FrameworkKind.Nextjs },
              diagnostics: {},
              clientSdk: [{ command: "true", enabled: true }],
            },
          },
          undefined,
          {
            createFrameworkSource: () => ({
              getScanRoots: () => [path.join(project.root, "src", "app", "api")],
              shouldProcessFile: () => true,
              getRoutePath: (filePath: string) => filePath,
              precheckFile: () => true,
              processFile: () => [],
            }),
          },
          async () => undefined,
        ),
      );

      await expect(runExternalCommand("false", [])).rejects.toThrow(/Command failed/);
    } finally {
      project.cleanup();
    }
  });

  it("does not write the incremental manifest when NODE_ENV is production", async () => {
    const project = createTempProject("nxog-core-generate-prod-manifest-");
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
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
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 * @response UserList
 */
export async function GET() {}

export type UserList = {
  items: string[];
};
`,
      );

      const { manifestPath, outputPath } = await withProjectCwd(project.root, async () => {
        await generateProject();
        return {
          outputPath: fs.realpathSync(path.join(project.root, "public", "openapi.json")),
          manifestPath: path.join(project.root, ".openapi-cache", "manifest.json"),
        };
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(false);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prevEnv;
      }
      project.cleanup();
    }
  });

  it("optionally emits the Next docs page when enabled", async () => {
    const project = createTempProject("nxog-core-generate-docs-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
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
        framework: {
          kind: FrameworkKind.Nextjs,
          router: "app",
        },
        docs: {
          enabled: true,
        },
      });
      writeAppRoute(
        project.root,
        ["users"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const { docsPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          docsPath: fs.realpathSync(path.join(project.root, "src", "app", "api-docs", "page.tsx")),
        };
      });

      expect(result.artifacts).toContainEqual(
        expect.objectContaining({
          kind: "docs",
          path: docsPath,
        }),
      );
      expect(fs.existsSync(docsPath)).toBe(true);
    } finally {
      project.cleanup();
    }
  });

  it("optionally emits the TanStack docs route when enabled", async () => {
    const project = createTempProject("nxog-core-generate-tanstack-docs-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
        },
        apiDir: "./src/routes/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: true,
        ignoreRoutes: [],
        debug: false,
        framework: {
          kind: FrameworkKind.Tanstack,
        },
        docs: {
          enabled: true,
        },
      });
      fs.mkdirSync(path.join(project.root, "src", "routes", "api"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "src", "routes", "api", "users.ts"),
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const { docsPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          docsPath: fs.realpathSync(path.join(project.root, "src", "routes", "api-docs.tsx")),
        };
      });
      const docsPage = fs.readFileSync(docsPath, "utf8");

      expect(result.artifacts).toContainEqual(
        expect.objectContaining({
          kind: "docs",
          path: docsPath,
        }),
      );
      expect(docsPage).toContain('createFileRoute("/api-docs")');
    } finally {
      project.cleanup();
    }
  });

  it("optionally emits the React Router docs route when enabled", async () => {
    const project = createTempProject("nxog-core-generate-rr-docs-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
          description: "Fixture template",
        },
        apiDir: "./src/routes/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        docsUrl: "api-docs",
        ui: "scalar",
        includeOpenApiRoutes: true,
        ignoreRoutes: [],
        debug: false,
        framework: {
          kind: "react-router",
        },
        docs: {
          enabled: true,
        },
      });
      fs.mkdirSync(path.join(project.root, "src", "routes", "api"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "src", "routes", "api", "users.ts"),
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const { docsPath, result } = await withProjectCwd(project.root, async () => {
        const result = await generateProject();
        return {
          result,
          docsPath: fs.realpathSync(path.join(project.root, "src", "routes", "api-docs.tsx")),
        };
      });
      const docsPage = fs.readFileSync(docsPath, "utf8");

      expect(result.artifacts).toContainEqual(
        expect.objectContaining({
          kind: "docs",
          path: docsPath,
        }),
      );
      expect(docsPage).toContain("export default function ApiDocsPage()");
    } finally {
      project.cleanup();
    }
  });

  it("reuses previous file hashes when mtime and size are unchanged", () => {
    const project = createTempProject("nxog-core-generate-fingerprint-");
    try {
      const filePath = path.join(project.root, "input.ts");
      fs.writeFileSync(filePath, "export const value = 1;\n");
      const first = createInputFingerprint([filePath]);
      const reused = createInputFingerprint([filePath], first.inputs);
      expect(reused.fingerprint).toBe(first.fingerprint);
      expect(reused.inputs[filePath]?.hash).toBe(first.inputs[filePath]?.hash);
    } finally {
      project.cleanup();
    }
  });

  it("uses an injected command runner for client SDK generation", async () => {
    const project = createTempProject("nxog-core-generate-sdk-");
    const runCommand = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: {
          title: "API Documentation",
          version: "1.0.0",
        },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        cache: false,
        clientSdk: [
          {
            command: "echo",
            args: ["sdk"],
            outputDir: "./sdk",
          },
        ],
      });
      writeAppRoute(
        project.root,
        ["health"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const result = await withProjectCwd(project.root, () =>
        generateProject({
          runCommand,
        }),
      );

      expect(runCommand).toHaveBeenCalled();
      expect(result.artifacts.some((artifact) => artifact.kind === "sdk")).toBe(true);
    } finally {
      project.cleanup();
    }
  });

  it("runs and fails external commands", async () => {
    await expect(runExternalCommand("true", [])).resolves.toBeUndefined();
    await expect(runExternalCommand("false", [])).rejects.toThrow("Command failed");
  });

  it("returns a cached result on a second generate with unchanged inputs", async () => {
    const project = createTempProject("nxog-core-generate-cache-");

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: { title: "API Documentation", version: "1.0.0" },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        cache: true,
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["health"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      const results = await withProjectCwd(project.root, async () => {
        const first = await generateProject();
        const second = await generateProject();
        return { first, second };
      });

      expect(results.first.cached).toBe(false);
      expect(results.second.cached).toBe(true);
    } finally {
      project.cleanup();
    }
  });

  it("reruns artifact diagnostics from a fresh collector on repeated cache hits", async () => {
    const project = createTempProject("nxog-core-generate-cache-diagnostics-");

    try {
      const apiDir = path.join(project.root, "src", "app", "api");
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(project.root, "package.json"), "{}\n");
      const loadedConfig = {
        configPath: undefined,
        config: {
          apiDir,
          schemaDir: path.join(project.root, "src"),
          schemaType: "typescript" as const,
          outputDir: path.join(project.root, "public"),
          outputFile: "openapi.json",
          generatedDir: path.join(project.root, ".openapi-cache"),
          cache: true,
          diagnostics: { failOn: "warning" as const },
          framework: { kind: FrameworkKind.Nextjs },
          overlay: { apply: [] },
        },
      };
      const adapters = {
        createFrameworkSource: () => ({
          getScanRoots: () => [apiDir],
          shouldProcessFile: () => true,
          getRoutePath: (filePath: string) => filePath,
          precheckFile: () => true,
          processFile: () => [],
        }),
        createSpecEmitters: () => [
          {
            kind: "overlay" as const,
            emit: async (context: GenerationContext) => {
              context.diagnostics.add({
                code: "artifact-warning",
                severity: "warning",
                message: "Fresh artifact warning",
              });
              return [];
            },
          },
        ],
      };

      const [first, second, third] = await withProjectCwd(project.root, async () => [
        await generateFromLoadedConfig(loadedConfig, undefined, adapters),
        await generateFromLoadedConfig(loadedConfig, undefined, adapters),
        await generateFromLoadedConfig(loadedConfig, undefined, adapters),
      ]);

      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(third.cached).toBe(true);
      for (const result of [first, second, third]) {
        expect(result.diagnosticsFailOn).toBe("warning");
        expect(
          result.diagnostics.filter((diagnostic) => diagnostic.code === "artifact-warning"),
        ).toHaveLength(1);
      }
      const cacheRecord = JSON.parse(
        fs.readFileSync(
          path.join(project.root, ".openapi-cache", "cache", "generate.json"),
          "utf8",
        ),
      ) as { diagnostics: Array<{ code: string }> };
      expect(cacheRecord.diagnostics).not.toContainEqual(
        expect.objectContaining({ code: "artifact-warning" }),
      );
    } finally {
      project.cleanup();
    }
  });

  it("honors OPENAPI_GEN_CACHE overrides", async () => {
    const project = createTempProject("nxog-core-generate-cache-env-");
    const previous = process.env.OPENAPI_GEN_CACHE;

    try {
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: { title: "API Documentation", version: "1.0.0" },
        apiDir: "./src/app/api",
        schemaDir: "./src",
        schemaType: "zod",
        outputDir: "./public",
        outputFile: "openapi.json",
        cache: true,
        generatedDir: ".openapi-cache",
      });
      writeAppRoute(
        project.root,
        ["health"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      process.env.OPENAPI_GEN_CACHE = "0";
      const disabled = await withProjectCwd(project.root, async () => {
        await generateProject();
        return await generateProject();
      });
      expect(disabled.cached).toBe(false);

      process.env.OPENAPI_GEN_CACHE = "1";
      const enabled = await withProjectCwd(project.root, async () => {
        await generateProject();
        return await generateProject();
      });
      expect(enabled.cached).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAPI_GEN_CACHE;
      } else {
        process.env.OPENAPI_GEN_CACHE = previous;
      }
      project.cleanup();
    }
  });

  it("requires generation adapters when called without a facade", async () => {
    await expect(
      generateFromLoadedConfig({
        config: {
          apiDir: "./src/app/api",
          schemaDir: "./src",
          outputDir: "./public",
          outputFile: "openapi.json",
        },
        configPath: undefined,
      }),
    ).rejects.toThrow("Generation adapters are required");
  });

  it("covers leftover emitters, docs side effects, and production manifest skip", async () => {
    const project = createTempProject("nxog-core-generate-leftover-");
    const previousNodeEnv = process.env.NODE_ENV;
    const processFile = vi.fn<() => []>(() => []);
    const emitOverlay = vi.fn<() => Promise<Array<{ kind: "overlay"; path: string }>>>(async () => [
      { kind: "overlay", path: path.join(project.root, "overlay.out.json") },
    ]);
    const emitArazzo = vi.fn<() => Promise<Array<{ kind: "arazzo"; path: string }>>>(async () => [
      { kind: "arazzo", path: path.join(project.root, "arazzo.out.json") },
    ]);
    const emitDocs = vi.fn<() => Promise<{ kind: "docs"; path: string }>>(async () => ({
      kind: "docs",
      path: path.join(project.root, "docs.html"),
    }));
    const runCommand = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const artifactsWritten = vi.fn<() => void>();

    try {
      fs.mkdirSync(path.join(project.root, "schemas"), { recursive: true });
      fs.writeFileSync(
        path.join(project.root, "schemas", "extra.ts"),
        "export type Extra = string;\n",
      );
      fs.mkdirSync(path.join(project.root, "src"), { recursive: true });
      fs.writeFileSync(path.join(project.root, "src", "overlay.json"), "{}\n");
      writeJsonFile(path.join(project.root, "next.openapi.json"), {
        openapi: "3.0.0",
        info: { title: "API Documentation", version: "1.0.0" },
        apiDir: "./src/app/api",
        schemaDir: ["./src", "./schemas"],
        schemaFiles: ["./schemas/extra.ts"],
        schemaType: "typescript",
        outputDir: "./public",
        outputFile: "openapi.json",
        cache: true,
        generatedDir: ".openapi-cache",
        docs: { enabled: true },
        overlay: { apply: ["./src/overlay.json"] },
        arazzo: { files: [] },
      });
      writeAppRoute(
        project.root,
        ["health"],
        `/**
 * @openapi
 */
export async function GET() {}
`,
      );

      process.env.NODE_ENV = "production";
      const results = await withProjectCwd(project.root, async () => {
        const loadedConfig = {
          configPath: path.join(project.root, "next.openapi.json"),
          config: {
            apiDir: "./src/app/api",
            schemaDir: ["./src", "./schemas"],
            schemaFiles: ["./schemas/extra.ts"],
            schemaType: "typescript" as const,
            outputDir: "./public",
            outputFile: "openapi.json",
            cache: true,
            generatedDir: ".openapi-cache",
            docs: { enabled: true },
            overlay: { apply: ["./src/overlay.json"] },
            arazzo: { files: [] },
            clientSdk: [{ command: "sdk-generator", enabled: true }],
            framework: { kind: FrameworkKind.Nextjs },
            diagnostics: { failOn: "never" as const },
            hooks: { artifactsWritten },
          },
        };
        const generationAdapters = {
          createFrameworkSource: () => ({
            getScanRoots: () => [path.join(project.root, "src", "app", "api")],
            shouldProcessFile: () => true,
            getRoutePath: (filePath: string) => filePath,
            precheckFile: () => true,
            processFile,
          }),
          emitDocsArtifact: emitDocs,
          createSpecEmitters: () => [
            {
              kind: "overlay" as const,
              emit: emitOverlay,
            },
            {
              kind: "arazzo" as const,
              emit: emitArazzo,
            },
          ],
        };
        const first = await generateFromLoadedConfig(
          loadedConfig,
          undefined,
          generationAdapters,
          runCommand,
        );
        const cacheFile = path.join(project.root, ".openapi-cache", "cache", "generate.json");
        const firstCache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
          fingerprint: string;
          inputs: Record<string, unknown>;
        };
        fs.appendFileSync(path.join(project.root, "src", "overlay.json"), "\n");
        const second = await generateFromLoadedConfig(
          loadedConfig,
          undefined,
          generationAdapters,
          runCommand,
        );
        const secondCache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
          fingerprint: string;
          inputs: Record<string, unknown>;
        };
        return { first, firstCache, second, secondCache };
      });

      expect(results.first.artifacts.map((artifact) => artifact.kind)).toEqual(
        expect.arrayContaining(["spec", "overlay", "arazzo", "docs"]),
      );
      expect(results.second.artifacts.map((artifact) => artifact.kind)).toEqual(
        expect.arrayContaining(["spec", "overlay", "arazzo", "docs"]),
      );
      expect(fs.existsSync(path.join(project.root, ".openapi-cache", "manifest.json"))).toBe(false);
      expect(results.first.cached).toBe(false);
      expect(Object.keys(results.firstCache.inputs)).not.toContain(
        path.join(project.root, "src", "overlay.json"),
      );
      expect(results.secondCache.inputs).toEqual(results.firstCache.inputs);
      expect(results.secondCache.fingerprint).toBe(results.firstCache.fingerprint);
      expect(results.second.cached).toBe(true);
      expect(results.second.diagnostics).toEqual(results.first.diagnostics);
      expect(results.second.diagnosticsFailOn).toBe("never");
      expect(processFile).toHaveBeenCalledOnce();
      expect(emitOverlay).toHaveBeenCalledTimes(2);
      expect(emitArazzo).toHaveBeenCalledTimes(2);
      expect(emitDocs).toHaveBeenCalledTimes(2);
      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(artifactsWritten).toHaveBeenCalledTimes(2);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      project.cleanup();
    }
  });
});
