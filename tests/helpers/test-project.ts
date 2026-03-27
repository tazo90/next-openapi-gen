import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OpenApiGenerator,
  type GeneratorPerformanceProfile,
} from "@next-openapi-gen/generator/openapi-generator.js";
import type {
  Diagnostic,
  OpenApiDocument,
  OpenApiTemplate,
} from "@next-openapi-gen/shared/types.js";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(helpersDir, "..");
const fixturesDir = path.join(testsDir, "fixtures");
const projectFixturesDir = path.join(fixturesDir, "projects");

export type TempProject = {
  root: string;
  cleanup(): void;
};

export type FixtureOpenApiVersion = "3.0" | "3.1" | "3.2";

export type GenerateFixtureSpecOptions = {
  fixturePath: string;
  openapiVersion?: FixtureOpenApiVersion;
  templateOverrides?: Partial<OpenApiTemplate>;
};

export type GenerateProjectSpecOptions = {
  projectPath: string;
  templateOverrides?: Partial<OpenApiTemplate>;
  templatePath?: string;
};

export type GeneratedFixtureSpec = {
  diagnostics: Diagnostic[];
  performanceProfile: GeneratorPerformanceProfile | null;
  project: TempProject;
  spec: OpenApiDocument;
  templatePath: string;
};

export function createTempProject(prefix: string): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  fs.mkdirSync(path.join(root, "src", "app", "api"), { recursive: true });

  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function getFixturePath(...segments: string[]) {
  return path.join(fixturesDir, ...segments);
}

export function getProjectFixturePath(...segments: string[]) {
  return path.join(projectFixturesDir, ...segments);
}

export function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function writeOpenApiTemplate(projectRoot: string, template: Partial<OpenApiTemplate> = {}) {
  const filePath = path.join(projectRoot, "next.openapi.json");

  writeJsonFile(filePath, {
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
    ...template,
  });

  return filePath;
}

export function writeAppRoute(projectRoot: string, routeSegments: string[], fileContents: string) {
  const routeDir = path.join(projectRoot, "src", "app", "api", ...routeSegments);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "route.ts"), fileContents);
}

export function copyProjectFixture(fixturePath: string): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-fixture-"));
  copyDirectoryContents(fixturePath, root);

  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function materializeTemplateVariant(
  projectRoot: string,
  openapiVersion: FixtureOpenApiVersion,
  templateOverrides: Partial<OpenApiTemplate> = {},
) {
  const templateFileName = `openapi-${openapiVersion}.json`;
  const templatePath = path.join(projectRoot, "templates", templateFileName);
  const filePath = path.join(projectRoot, "next.openapi.json");
  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8")) as OpenApiTemplate;

  writeJsonFile(filePath, mergeJson(template, templateOverrides));

  return filePath;
}

export function withProjectCwd<T>(projectRoot: string, callback: () => T): T {
  const previousCwd = process.cwd();
  process.chdir(projectRoot);

  try {
    return callback();
  } finally {
    process.chdir(previousCwd);
  }
}

export function generateFixtureSpec({
  fixturePath,
  openapiVersion = "3.0",
  templateOverrides = {},
}: GenerateFixtureSpecOptions): GeneratedFixtureSpec {
  const project = copyProjectFixture(fixturePath);
  const templatePath = materializeTemplateVariant(project.root, openapiVersion, templateOverrides);

  try {
    const { diagnostics, performanceProfile, spec } = withProjectCwd(project.root, () => {
      const generator = new OpenApiGenerator({ templatePath });
      const spec = generator.generate();

      return {
        diagnostics: generator.getDiagnostics(),
        performanceProfile: generator.getPerformanceProfile(),
        spec,
      };
    });

    return {
      diagnostics,
      performanceProfile,
      project,
      spec,
      templatePath,
    };
  } catch (error) {
    project.cleanup();
    throw error;
  }
}

export function generateProjectSpec({
  projectPath,
  templateOverrides = {},
  templatePath = "next.openapi.json",
}: GenerateProjectSpecOptions): GeneratedFixtureSpec {
  const project = copyProjectFixture(projectPath);
  const resolvedTemplatePath = path.join(project.root, templatePath);

  if (Object.keys(templateOverrides).length > 0) {
    const template = JSON.parse(fs.readFileSync(resolvedTemplatePath, "utf-8")) as OpenApiTemplate;
    writeJsonFile(resolvedTemplatePath, mergeJson(template, templateOverrides));
  }

  try {
    const { diagnostics, performanceProfile, spec } = withProjectCwd(project.root, () => {
      const generator = new OpenApiGenerator({ templatePath: resolvedTemplatePath });
      const spec = generator.generate();

      return {
        diagnostics: generator.getDiagnostics(),
        performanceProfile: generator.getPerformanceProfile(),
        spec,
      };
    });

    return {
      diagnostics,
      performanceProfile,
      project,
      spec,
      templatePath: resolvedTemplatePath,
    };
  } catch (error) {
    project.cleanup();
    throw error;
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string) {
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
    if ([".next", "dist", "node_modules", "coverage"].includes(entry.name)) {
      return;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyDirectoryContents(sourcePath, targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeJson<T>(base: T, overrides: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return (overrides as T) ?? base;
  }

  const merged: Record<string, unknown> = { ...base };

  Object.entries(overrides).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      return;
    }

    const existingValue = merged[key];
    merged[key] =
      isPlainObject(existingValue) && isPlainObject(value)
        ? mergeJson(existingValue, value)
        : value;
  });

  return merged as T;
}
