#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type BenchSummary = {
  id: string;
  mode: "cold" | "warm";
  openapiVersion: string;
  profile: {
    totalMs: number;
    [key: string]: number;
  };
  fixture: string;
};

type BenchReport = {
  generatedAt: string;
  iterations: number;
  scenarios: BenchSummary[];
};

type CliArgs = {
  baseline: string;
  current: string;
  failOnRegression: boolean;
  minDeltaMs: number;
  threshold: number;
  writeBaseline: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    baseline: "",
    current: "",
    failOnRegression: false,
    minDeltaMs: 50,
    threshold: 0.3,
    writeBaseline: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--baseline":
        args.baseline = argv[++i] ?? "";
        break;
      case "--current":
        args.current = argv[++i] ?? "";
        break;
      case "--threshold":
        args.threshold = Number(argv[++i] ?? "0.3");
        break;
      case "--min-delta-ms":
        args.minDeltaMs = Number(argv[++i] ?? "50");
        break;
      case "--fail-on-regression":
        args.failOnRegression = true;
        break;
      case "--write-baseline":
        args.writeBaseline = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.current || !args.baseline) {
    throw new Error("Both --current and --baseline are required.");
  }

  return args;
}

function printHelp(): void {
  process.stdout.write(`Usage:
  node scripts/check-generator-bench-regression.mts \\
    --current tests/bench/generator/current.json \\
    --baseline tests/bench/generator/baseline.json \\
    [--threshold 0.3] [--min-delta-ms 50] [--fail-on-regression] [--write-baseline]
`);
}

function readReport(filePath: string): BenchReport {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as BenchReport;
}

function getScenarioKey(scenario: BenchSummary): string {
  return `${scenario.id} | ${scenario.mode}`;
}

function createScenarioMap(report: BenchReport): Map<string, BenchSummary> {
  return new Map(report.scenarios.map((scenario) => [getScenarioKey(scenario), scenario]));
}

function writeBaseline(currentPath: string, baselinePath: string): void {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.copyFileSync(currentPath, baselinePath);
  process.stdout.write(`Updated generator benchmark baseline at ${baselinePath}\n`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.writeBaseline) {
    writeBaseline(args.current, args.baseline);
    return;
  }

  const current = createScenarioMap(readReport(args.current));
  const baseline = createScenarioMap(readReport(args.baseline));
  const regressions: string[] = [];
  const additions: string[] = [];

  for (const [key, currentScenario] of current) {
    const baselineScenario = baseline.get(key);
    if (!baselineScenario) {
      additions.push(key);
      continue;
    }

    const baselineMs = baselineScenario.profile.totalMs;
    const currentMs = currentScenario.profile.totalMs;
    const ratio = currentMs / baselineMs;
    const deltaMs = currentMs - baselineMs;
    if (deltaMs >= args.minDeltaMs && ratio > 1 + args.threshold) {
      regressions.push(
        `${key}: ${currentMs.toFixed(2)}ms vs ${baselineMs.toFixed(2)}ms (${(
          (ratio - 1) *
          100
        ).toFixed(1)}% slower)`,
      );
    }
  }

  if (additions.length > 0) {
    process.stdout.write(`New generator benchmark scenarios:\n${additions.join("\n")}\n`);
  }

  if (regressions.length > 0) {
    const message = `Generator benchmark regressions:\n${regressions.join("\n")}\n`;
    if (args.failOnRegression) {
      process.stderr.write(message);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(message);
    return;
  }

  process.stdout.write(`Generator benchmark check passed (${current.size} scenarios).\n`);
}

main();
