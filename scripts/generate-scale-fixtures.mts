#!/usr/bin/env node
import process from "node:process";

import { getTotalRouteCount } from "./fixture-scale/domain.mts";
import {
  generateAppTarget,
  generateScaleTarget,
  writeGeneratedManifest,
} from "./fixture-scale/emit.mts";
import { APP_TARGETS, FIXTURE_TARGETS } from "./fixture-scale/targets.mts";

type TargetKind = "fixtures" | "apps" | "all";

function parseArgs(argv: string[]) {
  let target: TargetKind = "all";
  let dryRun = false;
  let clean = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--clean") {
      clean = true;
    } else if (arg.startsWith("--target=")) {
      const value = arg.slice("--target=".length) as TargetKind;
      target = value;
    }
  }

  return { target, dryRun, clean };
}

function main() {
  const { target, dryRun, clean } = parseArgs(process.argv.slice(2));
  const expectedRoutes = getTotalRouteCount();

  if (expectedRoutes !== 125) {
    throw new Error(`Expected 125 generated routes, got ${expectedRoutes}.`);
  }

  let written = 0;

  if (target === "fixtures" || target === "all") {
    for (const fixtureTarget of FIXTURE_TARGETS) {
      if (clean) {
        console.log(`Cleaning ${fixtureTarget.id}`);
      }
      written += generateScaleTarget(fixtureTarget, dryRun);
      writeGeneratedManifest(fixtureTarget, dryRun);
      console.log(`${dryRun ? "[dry-run] " : ""}Generated fixture ${fixtureTarget.id}`);
    }
  }

  if (target === "apps" || target === "all") {
    for (const appTarget of APP_TARGETS) {
      generateAppTarget(appTarget, dryRun);
      console.log(`${dryRun ? "[dry-run] " : ""}Generated app scale content ${appTarget.id}`);
    }
  }

  console.log(`Scale generation complete (${written} files written for fixtures).`);
}

main();
