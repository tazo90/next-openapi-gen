import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emitRoutes } from "./routes.mts";
import { emitSchemas, type SchemaFlavor } from "./schemas.mts";
import type { AppTarget, ScaleTarget } from "./targets.mts";
import { emitOpenApiTemplates } from "./templates.mts";
import { copyDirectory, removeDirIfExists, writeTextFile } from "./utils.mts";

export function generateScaleTarget(target: ScaleTarget, dryRun: boolean): number {
  cleanTargetGeneratedPaths(target, dryRun);

  if (target.copyShowcaseRoutesFrom) {
    copyDirectory(
      target.copyShowcaseRoutesFrom,
      path.join(target.outputPath, "src", "app", "api"),
      dryRun,
    );
  }

  const flavor = normalizeFlavor(target.flavor);
  const schemaFiles = emitSchemas({
    outputDir: target.outputPath,
    flavor,
    schemaLayout: target.schemaLayout,
    dryRun,
  });

  if (target.copySchemasFrom) {
    const catalogTarget =
      flavor === "zod" || flavor === "drizzle-zod"
        ? path.join(target.outputPath, "src", "schemas")
        : path.join(target.outputPath, "src", "schemas");
    copyDirectory(target.copySchemasFrom, catalogTarget, dryRun);
  }

  const routeFiles = emitRoutes({
    outputDir: target.outputPath,
    framework: target.framework,
    flavor,
    schemaLayout: target.schemaLayout,
    dryRun,
    operationIdPrefix: target.operationIdPrefix,
  });

  const templateFiles = emitOpenApiTemplates(target.outputPath, target.template, dryRun);
  return schemaFiles.length + routeFiles.length + templateFiles.length;
}

export function generateAppTarget(target: AppTarget, dryRun: boolean): number {
  cleanTargetGeneratedPaths(target, dryRun);

  const flavor = normalizeFlavor(target.flavor);
  emitSchemas({
    outputDir: target.outputPath,
    flavor,
    schemaLayout: target.schemaLayout,
    dryRun,
  });

  emitRoutes({
    outputDir: target.outputPath,
    framework: target.framework,
    flavor,
    schemaLayout: target.schemaLayout,
    dryRun,
    operationIdPrefix: target.operationIdPrefix,
  });

  return 0;
}

function normalizeFlavor(flavor: ScaleTarget["flavor"]): SchemaFlavor {
  if (flavor === "filtered") {
    return "typescript";
  }
  if (flavor === "mixed") {
    return "mixed";
  }
  return flavor;
}

function cleanTargetGeneratedPaths(target: ScaleTarget, dryRun: boolean): void {
  for (const relativePath of target.cleanGeneratedSubdirs) {
    const absolutePath = path.join(target.outputPath, relativePath);
    if (relativePath.endsWith(".ts")) {
      if (!dryRun && fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath, { force: true });
      }
      continue;
    }
    removeDirIfExists(absolutePath, dryRun);
  }
}

export function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function writeGeneratedManifest(target: ScaleTarget, dryRun: boolean): void {
  const manifestPath = path.join(target.outputPath, "GENERATED.scale.json");
  writeTextFile(
    manifestPath,
    `${JSON.stringify(
      {
        generator: "scripts/generate-scale-fixtures.mts",
        target: target.id,
        routeCount: 125,
        schemaModules: 50,
      },
      null,
      2,
    )}\n`,
    dryRun,
  );
}
